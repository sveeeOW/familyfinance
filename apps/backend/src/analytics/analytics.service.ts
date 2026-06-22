import { Injectable } from '@nestjs/common';
import { ExpenseScope, ExpenseStatus, Recurrence } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
  ) {}

  private monthBounds(date = new Date()) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return { start, end };
  }

  // ─── Сводка для главного экрана (§23.1) ───────────────────────────────────
  async summary(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const { start, end } = this.monthBounds();

    const [incomes, expenses, recurring, credits] = await Promise.all([
      this.prisma.income.findMany({ where: { portfolioId, date: { gte: start, lt: end } } }),
      this.prisma.expense.findMany({
        where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { gte: start, lt: end } },
        include: { category: { select: { id: true, name: true, color: true, icon: true } } },
      }),
      this.prisma.recurringPayment.findMany({ where: { portfolioId } }),
      this.prisma.credit.findMany({ where: { portfolioId } }),
    ]);

    const totalIncome = incomes.reduce((s, i) => s + Number(i.amount), 0);
    const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const balance = totalIncome - totalExpense;

    const obligatory =
      recurring.reduce((s, r) => s + Number(r.amount), 0) +
      credits.reduce((s, c) => s + Number(c.monthlyPayment), 0);

    // расходы по категориям
    const byCategoryMap = new Map<string, { id: string; name: string; color?: string; icon?: string; amount: number }>();
    for (const e of expenses) {
      const key = e.category?.id ?? 'none';
      const name = e.category?.name ?? 'Без категории';
      const prev = byCategoryMap.get(key);
      byCategoryMap.set(key, {
        id: key,
        name,
        color: e.category?.color ?? undefined,
        icon: e.category?.icon ?? undefined,
        amount: (prev?.amount ?? 0) + Number(e.amount),
      });
    }
    const byCategory = [...byCategoryMap.values()].sort((a, b) => b.amount - a.amount);

    // расходы по участникам
    const byMemberMap = new Map<string, number>();
    for (const e of expenses) {
      byMemberMap.set(e.paidByUserId, (byMemberMap.get(e.paidByUserId) ?? 0) + Number(e.amount));
    }
    const memberUsers = await this.prisma.user.findMany({
      where: { id: { in: [...byMemberMap.keys()] } },
      select: { id: true, name: true },
    });
    const byMember = memberUsers.map((u) => ({
      userId: u.id,
      name: u.name,
      amount: byMemberMap.get(u.id) ?? 0,
    }));

    const personal = expenses
      .filter((e) => e.scope === ExpenseScope.PERSONAL)
      .reduce((s, e) => s + Number(e.amount), 0);
    const shared = totalExpense - personal;

    // обязательные платежи, оставшиеся до конца месяца
    const today = new Date();
    const remainingObligatory =
      recurring
        .filter((r) => r.paymentDay >= today.getDate())
        .reduce((s, r) => s + Number(r.amount), 0) +
      credits
        .filter((c) => c.paymentDay >= today.getDate())
        .reduce((s, c) => s + Number(c.monthlyPayment), 0);

    const freeMoney = balance - remainingObligatory;

    return {
      period: { from: start, to: end },
      totalIncome: Math.round(totalIncome),
      totalExpense: Math.round(totalExpense),
      balance: Math.round(balance),
      obligatoryTotal: Math.round(obligatory),
      remainingObligatory: Math.round(remainingObligatory),
      freeMoney: Math.round(freeMoney),
      personalExpense: Math.round(personal),
      sharedExpense: Math.round(shared),
      byCategory: byCategory.map((c) => ({ ...c, amount: Math.round(c.amount) })),
      byMember: byMember.map((m) => ({ ...m, amount: Math.round(m.amount) })),
    };
  }

  // ─── Доходы/расходы по месяцам (§23.2) ────────────────────────────────────
  async monthly(portfolioId: string, userId: string, months = 6) {
    await this.access.requireMember(portfolioId, userId);
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const [incomes, expenses] = await Promise.all([
      this.prisma.income.findMany({ where: { portfolioId, date: { gte: from } } }),
      this.prisma.expense.findMany({
        where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { gte: from } },
      }),
    ]);

    const buckets: Record<string, { month: string; income: number; expense: number }> = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[key] = { month: key, income: 0, expense: 0 };
    }
    const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    for (const i of incomes) if (buckets[keyOf(i.date)]) buckets[keyOf(i.date)].income += Number(i.amount);
    for (const e of expenses) if (buckets[keyOf(e.date)]) buckets[keyOf(e.date)].expense += Number(e.amount);

    return Object.values(buckets).map((b) => ({
      month: b.month,
      income: Math.round(b.income),
      expense: Math.round(b.expense),
      balance: Math.round(b.income - b.expense),
    }));
  }

  async categories(portfolioId: string, userId: string) {
    const s = await this.summary(portfolioId, userId);
    return s.byCategory;
  }

  // ─── Прогноз остатка (§17.1) и на 3/6/12 месяцев ──────────────────────────
  async forecast(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const { start, end } = this.monthBounds();

    const [incomes, recurring, credits, variableExpenses] = await Promise.all([
      this.prisma.income.findMany({ where: { portfolioId } }),
      this.prisma.recurringPayment.findMany({ where: { portfolioId } }),
      this.prisma.credit.findMany({ where: { portfolioId } }),
      // средние переменные расходы за последние 3 месяца
      this.prisma.expense.findMany({
        where: {
          portfolioId,
          status: ExpenseStatus.CONFIRMED,
          date: { gte: new Date(start.getFullYear(), start.getMonth() - 3, 1), lt: start },
        },
      }),
    ]);

    const monthlyEq = (amount: number, r: Recurrence) =>
      r === Recurrence.MONTHLY ? amount : r === Recurrence.TWICE_A_MONTH ? amount * 2 : r === Recurrence.WEEKLY ? amount * 4.33 : 0;

    const expectedIncome = incomes.reduce((s, i) => s + monthlyEq(Number(i.amount), i.recurrence), 0);
    const obligatory =
      recurring.reduce((s, r) => s + Number(r.amount), 0) +
      credits.reduce((s, c) => s + Number(c.monthlyPayment), 0);
    const avgVariable = variableExpenses.reduce((s, e) => s + Number(e.amount), 0) / 3;

    // §17.1: Прогноз остатка = доходы - обязательные - средние переменные
    const monthlyForecast = expectedIncome - obligatory - avgVariable;

    const horizon = (m: number) => Math.round(monthlyForecast * m);

    return {
      expectedIncome: Math.round(expectedIncome),
      obligatory: Math.round(obligatory),
      avgVariableExpense: Math.round(avgVariable),
      endOfMonthBalance: Math.round(monthlyForecast),
      forecast: {
        currentMonth: Math.round(monthlyForecast),
        in3Months: horizon(3),
        in6Months: horizon(6),
        in12Months: horizon(12),
      },
    };
  }

  // ─── Кредитная нагрузка (§17.3) ───────────────────────────────────────────
  async creditsAnalytics(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const credits = await this.prisma.credit.findMany({ where: { portfolioId } });
    const totalRemaining = credits.reduce((s, c) => s + Number(c.remainingAmount), 0);
    const monthlyLoad = credits.reduce((s, c) => s + Number(c.monthlyPayment), 0);
    return {
      totalRemaining: Math.round(totalRemaining),
      monthlyLoad: Math.round(monthlyLoad),
      count: credits.length,
      credits: credits.map((c) => {
        const monthsLeft = Number(c.monthlyPayment) > 0 ? Math.ceil(Number(c.remainingAmount) / Number(c.monthlyPayment)) : 0;
        return {
          id: c.id,
          title: c.title,
          remaining: Math.round(Number(c.remainingAmount)),
          monthlyPayment: Math.round(Number(c.monthlyPayment)),
          monthsLeft,
        };
      }),
    };
  }
}
