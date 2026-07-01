import { Injectable } from '@nestjs/common';
import { CreditStatus, ExpenseScope, ExpenseStatus, Recurrence } from '@prisma/client';
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

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private daysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
  }

  private dateInMonth(year: number, month: number, day: number) {
    return new Date(year, month, Math.min(Math.max(1, day), this.daysInMonth(year, month)));
  }

  private addMonthsClamped(date: Date, months: number) {
    return this.dateInMonth(date.getFullYear(), date.getMonth() + months, date.getDate());
  }

  private parseCustomPeriod(text?: string | null): { interval: number; unit: 'DAY' | 'WEEK' | 'MONTH' } | null {
    const tag = text?.split('[period:')[1]?.split(']')[0];
    if (!tag) return null;
    const [rawInterval, rawUnit] = tag.split(':');
    const interval = Number(rawInterval);
    if (!Number.isInteger(interval) || interval <= 0) return null;
    if (rawUnit !== 'DAY' && rawUnit !== 'WEEK' && rawUnit !== 'MONTH') return null;
    return { interval, unit: rawUnit };
  }

  private addPeriod(date: Date, recurrence: Recurrence, text?: string | null): Date {
    const next = new Date(date);
    if (recurrence === Recurrence.WEEKLY) {
      next.setDate(next.getDate() + 7);
      return next;
    }
    if (recurrence === Recurrence.TWICE_A_MONTH) {
      next.setDate(next.getDate() + 14);
      return next;
    }
    if (recurrence === Recurrence.CUSTOM) {
      const custom = this.parseCustomPeriod(text);
      if (!custom) return this.addMonthsClamped(next, 1);
      if (custom.unit === 'DAY') next.setDate(next.getDate() + custom.interval);
      if (custom.unit === 'WEEK') next.setDate(next.getDate() + custom.interval * 7);
      if (custom.unit === 'MONTH') return this.addMonthsClamped(next, custom.interval);
      return next;
    }
    return this.addMonthsClamped(next, 1);
  }

  private countMonthlyByDay(params: { firstDate: Date; paymentDay: number; rangeStart: Date; rangeEnd: Date }) {
    const firstDate = this.startOfDay(params.firstDate);
    let cursor = new Date(params.rangeStart.getFullYear(), params.rangeStart.getMonth(), 1);
    let count = 0;
    let guard = 0;

    while (cursor < params.rangeEnd && guard < 240) {
      const occurrence = this.dateInMonth(cursor.getFullYear(), cursor.getMonth(), params.paymentDay);
      if (occurrence >= params.rangeStart && occurrence < params.rangeEnd && occurrence >= firstDate) count += 1;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      guard += 1;
    }

    return count;
  }

  private countOccurrences(params: {
    startDate: Date;
    recurrence: Recurrence;
    rangeStart: Date;
    rangeEnd: Date;
    text?: string | null;
    paymentDay?: number | null;
  }) {
    const { recurrence, rangeStart, rangeEnd, text, paymentDay } = params;
    const startDate = this.startOfDay(params.startDate);

    if (recurrence === Recurrence.ONE_TIME) {
      return startDate >= rangeStart && startDate < rangeEnd ? 1 : 0;
    }

    // Для ежемесячных событий дата — это не конкретный месяц, а якорь расписания.
    // Считаем по числу месяца: ипотека каждый 22 день, аренда каждый 1 день и т.п.
    if (recurrence === Recurrence.MONTHLY && paymentDay) {
      return this.countMonthlyByDay({ firstDate: startDate, paymentDay, rangeStart, rangeEnd });
    }

    let current = new Date(startDate);
    let guard = 0;
    while (current < rangeStart && guard < 600) {
      current = this.addPeriod(current, recurrence, text);
      guard += 1;
    }

    let count = 0;
    while (current < rangeEnd && guard < 700) {
      if (current >= rangeStart) count += 1;
      current = this.addPeriod(current, recurrence, text);
      guard += 1;
    }
    return count;
  }

  private incomeForRange(incomes: any[], start: Date, end: Date) {
    return incomes.reduce((sum, income) => {
      const count = this.countOccurrences({
        startDate: income.date,
        recurrence: income.recurrence,
        rangeStart: start,
        rangeEnd: end,
        text: income.description,
        paymentDay: income.paymentDay ?? income.date?.getDate?.(),
      });
      return sum + Number(income.amount) * count;
    }, 0);
  }

  private recurringForRange(items: any[], start: Date, end: Date) {
    return items.reduce((sum, item) => {
      const count = this.countOccurrences({
        startDate: item.nextPaymentDate,
        recurrence: item.recurrence,
        rangeStart: start,
        rangeEnd: end,
        text: item.comment,
        paymentDay: item.paymentDay,
      });
      return sum + Number(item.amount) * count;
    }, 0);
  }

  async summary(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const { start, end } = this.monthBounds();

    const [incomes, expenses, recurring, credits] = await Promise.all([
      this.prisma.income.findMany({ where: { portfolioId } }),
      this.prisma.expense.findMany({
        where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { gte: start, lt: end } },
        include: { category: { select: { id: true, name: true, color: true, icon: true } } },
      }),
      this.prisma.recurringPayment.findMany({
        where: { portfolioId, status: CreditStatus.ACTIVE },
        include: { category: { select: { id: true, name: true, color: true, icon: true } } },
      }),
      this.prisma.credit.findMany({ where: { portfolioId, status: CreditStatus.ACTIVE } }),
    ]);

    const scheduledIncome = this.incomeForRange(incomes, start, end);
    const actualExpense = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const plannedExpense = this.recurringForRange(recurring, start, end);
    const creditExpense = credits.reduce((s, c) => s + Number(c.monthlyPayment), 0);
    const totalIncome = scheduledIncome;
    const totalExpense = actualExpense + plannedExpense + creditExpense;
    const balance = totalIncome - totalExpense;
    const obligatory = plannedExpense + creditExpense;

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
    for (const r of recurring) {
      const count = this.countOccurrences({
        startDate: r.nextPaymentDate,
        recurrence: r.recurrence,
        rangeStart: start,
        rangeEnd: end,
        text: r.comment,
        paymentDay: r.paymentDay,
      });
      if (!count) continue;
      const key = r.category?.id ?? `recurring-${r.id}`;
      const name = r.category?.name ?? r.title;
      const prev = byCategoryMap.get(key);
      byCategoryMap.set(key, {
        id: key,
        name,
        color: r.category?.color ?? undefined,
        icon: r.category?.icon ?? undefined,
        amount: (prev?.amount ?? 0) + Number(r.amount) * count,
      });
    }
    const byCategory = [...byCategoryMap.values()].sort((a, b) => b.amount - a.amount);

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

    const personal = expenses.filter((e) => e.scope === ExpenseScope.PERSONAL).reduce((s, e) => s + Number(e.amount), 0);
    const shared = totalExpense - personal;

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const remainingRecurring = this.recurringForRange(recurring, todayStart, end);
    const remainingCredits = credits.filter((c) => c.paymentDay >= today.getDate()).reduce((s, c) => s + Number(c.monthlyPayment), 0);
    const remainingObligatory = remainingRecurring + remainingCredits;
    const freeMoney = balance - remainingObligatory;

    return {
      period: { from: start, to: end },
      totalIncome: Math.round(totalIncome),
      totalExpense: Math.round(totalExpense),
      actualExpense: Math.round(actualExpense),
      plannedExpense: Math.round(plannedExpense + creditExpense),
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

  async monthly(portfolioId: string, userId: string, months = 6) {
    await this.access.requireMember(portfolioId, userId);
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const [incomes, expenses, recurring, credits] = await Promise.all([
      this.prisma.income.findMany({ where: { portfolioId } }),
      this.prisma.expense.findMany({ where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { gte: from } } }),
      this.prisma.recurringPayment.findMany({ where: { portfolioId, status: CreditStatus.ACTIVE } }),
      this.prisma.credit.findMany({ where: { portfolioId, status: CreditStatus.ACTIVE } }),
    ]);

    const buckets: Record<string, { month: string; income: number; expense: number }> = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[key] = {
        month: key,
        income: this.incomeForRange(incomes, d, next),
        expense: this.recurringForRange(recurring, d, next) + credits.reduce((s, c) => s + Number(c.monthlyPayment), 0),
      };
    }
    const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

  async forecast(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const { start, end } = this.monthBounds();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [incomes, recurring, credits, currentMonthExpenses, variableExpenses] = await Promise.all([
      this.prisma.income.findMany({ where: { portfolioId } }),
      this.prisma.recurringPayment.findMany({ where: { portfolioId, status: CreditStatus.ACTIVE } }),
      this.prisma.credit.findMany({ where: { portfolioId, status: CreditStatus.ACTIVE } }),
      this.prisma.expense.findMany({ where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { gte: start, lt: end } } }),
      this.prisma.expense.findMany({
        where: {
          portfolioId,
          status: ExpenseStatus.CONFIRMED,
          date: { gte: new Date(start.getFullYear(), start.getMonth() - 3, 1), lt: start },
        },
      }),
    ]);

    const creditMonthly = credits.reduce((s, c) => s + Number(c.monthlyPayment), 0);
    const remainingCredits = credits.filter((c) => c.paymentDay >= now.getDate()).reduce((s, c) => s + Number(c.monthlyPayment), 0);

    const actualExpenseToDate = currentMonthExpenses
      .filter((e) => e.date < todayStart)
      .reduce((s, e) => s + Number(e.amount), 0);
    const futureOneOffExpense = currentMonthExpenses
      .filter((e) => e.date >= todayStart)
      .reduce((s, e) => s + Number(e.amount), 0);

    const actualIncomeToDate = this.incomeForRange(incomes, start, todayStart);
    const restIncome = this.incomeForRange(incomes, todayStart, end);
    const restRecurring = this.recurringForRange(recurring, todayStart, end);
    const restExpense = restRecurring + remainingCredits + futureOneOffExpense;
    const actualBalance = actualIncomeToDate - actualExpenseToDate;
    const endOfMonthBalance = actualBalance + restIncome - restExpense;

    let expectedIncome = 0;
    let obligatory = 0;
    for (let i = 0; i < 6; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      expectedIncome += this.incomeForRange(incomes, d, next);
      obligatory += this.recurringForRange(recurring, d, next) + creditMonthly;
    }
    expectedIncome = expectedIncome / 6;
    obligatory = obligatory / 6;

    const avgVariable = variableExpenses.reduce((s, e) => s + Number(e.amount), 0) / 3;
    const monthlyForecast = expectedIncome - obligatory - avgVariable;
    const horizon = (m: number) => Math.round(monthlyForecast * m);

    return {
      actualToDate: {
        income: Math.round(actualIncomeToDate),
        expense: Math.round(actualExpenseToDate),
        balance: Math.round(actualBalance),
      },
      restOfMonth: {
        income: Math.round(restIncome),
        expense: Math.round(restExpense),
        recurring: Math.round(restRecurring),
        credits: Math.round(remainingCredits),
        oneOff: Math.round(futureOneOffExpense),
      },
      expectedIncome: Math.round(expectedIncome),
      obligatory: Math.round(obligatory),
      avgVariableExpense: Math.round(avgVariable),
      endOfMonthBalance: Math.round(endOfMonthBalance),
      forecast: {
        currentMonth: Math.round(monthlyForecast),
        in3Months: horizon(3),
        in6Months: horizon(6),
        in12Months: horizon(12),
      },
    };
  }

  async creditsAnalytics(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const credits = await this.prisma.credit.findMany({ where: { portfolioId, status: CreditStatus.ACTIVE } });
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
