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

  private businessDayBeforeWeekend(date: Date) {
    const next = this.startOfDay(date);
    const day = next.getDay();
    if (day === 6) next.setDate(next.getDate() - 1);
    if (day === 0) next.setDate(next.getDate() - 2);
    return next;
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

  private parseAnchorDate(text?: string | null): Date | null {
    const raw = text?.split('[anchor:')[1]?.split(']')[0];
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private recurrenceFromComment(comment?: string | null): Recurrence | null {
    if (!comment?.includes('Период:')) return null;
    if (comment.includes('каждую неделю')) return Recurrence.WEEKLY;
    if (comment.includes('каждый месяц')) return Recurrence.MONTHLY;
    if (comment.includes('[period:')) return Recurrence.CUSTOM;
    return null;
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
    if (recurrence === Recurrence.ONE_TIME) return startDate >= rangeStart && startDate < rangeEnd ? 1 : 0;
    if (recurrence === Recurrence.MONTHLY && paymentDay) return this.countMonthlyByDay({ firstDate: startDate, paymentDay, rangeStart, rangeEnd });
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

  private countIncomeOccurrences(params: {
    startDate: Date;
    recurrence: Recurrence;
    rangeStart: Date;
    rangeEnd: Date;
    text?: string | null;
    paymentDay?: number | null;
  }) {
    const { recurrence, rangeStart, rangeEnd, text, paymentDay } = params;
    const firstDate = this.startOfDay(params.startDate);
    if (recurrence === Recurrence.ONE_TIME) {
      const paidDate = this.businessDayBeforeWeekend(firstDate);
      return paidDate >= rangeStart && paidDate < rangeEnd ? 1 : 0;
    }
    let current: Date;
    let count = 0;
    let guard = 0;
    if (recurrence === Recurrence.MONTHLY && paymentDay) {
      current = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      while (current < rangeEnd && guard < 240) {
        const planned = this.dateInMonth(current.getFullYear(), current.getMonth(), paymentDay);
        const paidDate = this.businessDayBeforeWeekend(planned);
        if (planned >= firstDate && paidDate >= rangeStart && paidDate < rangeEnd) count += 1;
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        guard += 1;
      }
      return count;
    }
    current = new Date(firstDate);
    while (current < rangeEnd && guard < 700) {
      const paidDate = this.businessDayBeforeWeekend(current);
      if (paidDate >= rangeStart && paidDate < rangeEnd) count += 1;
      current = this.addPeriod(current, recurrence, text);
      guard += 1;
    }
    return count;
  }

  private incomeForRange(incomes: any[], start: Date, end: Date) {
    return incomes.reduce((sum, income) => {
      const count = this.countIncomeOccurrences({
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

  private hasMatchingRecurringPayment(expense: any, recurring: any[], recurrence: Recurrence, paymentDay: number) {
    return recurring.some((item) => {
      const sameAmount = Math.abs(Number(item.amount) - Number(expense.amount)) < 0.01;
      const sameDay = Number(item.paymentDay) === Number(paymentDay);
      const sameRecurrence = item.recurrence === recurrence;
      const sameCategory = (item.categoryId ?? null) === (expense.categoryId ?? null);
      const expenseTitle = String(expense.title ?? expense.merchant ?? '').trim().toLowerCase();
      const itemTitle = String(item.title ?? '').trim().toLowerCase();
      const titleLooksSame = Boolean(expenseTitle && itemTitle && (expenseTitle === itemTitle || expenseTitle.includes(itemTitle) || itemTitle.includes(expenseTitle)));
      if (!sameAmount || !sameDay || !sameRecurrence) return false;
      if (sameCategory) return true;
      return titleLooksSame;
    });
  }

  private recurringExpensesFromExpenseComments(expenses: any[], recurring: any[], start: Date, end: Date) {
    return expenses.reduce((sum, expense) => {
      const recurrence = this.recurrenceFromComment(expense.comment);
      if (!recurrence) return sum;
      const anchor = this.parseAnchorDate(expense.comment) ?? expense.date;
      const paymentDay = anchor.getDate();
      if (this.hasMatchingRecurringPayment(expense, recurring, recurrence, paymentDay)) return sum;
      const count = this.countOccurrences({ startDate: anchor, recurrence, rangeStart: start, rangeEnd: end, text: expense.comment, paymentDay });
      return sum + Number(expense.amount) * count;
    }, 0);
  }

  private addRecurringExpenseCommentsToCategories(
    byCategoryMap: Map<string, { id: string; name: string; color?: string; icon?: string; amount: number }>,
    expenses: any[],
    recurring: any[],
    start: Date,
    end: Date,
  ) {
    for (const expense of expenses) {
      const recurrence = this.recurrenceFromComment(expense.comment);
      if (!recurrence) continue;
      const anchor = this.parseAnchorDate(expense.comment) ?? expense.date;
      const paymentDay = anchor.getDate();
      if (this.hasMatchingRecurringPayment(expense, recurring, recurrence, paymentDay)) continue;
      const count = this.countOccurrences({ startDate: anchor, recurrence, rangeStart: start, rangeEnd: end, text: expense.comment, paymentDay });
      if (!count) continue;
      const key = expense.category?.id ?? `expense-recurring-${expense.id}`;
      const name = expense.category?.name ?? expense.title ?? expense.merchant ?? 'Регулярный расход';
      const prev = byCategoryMap.get(key);
      byCategoryMap.set(key, { id: key, name, color: expense.category?.color ?? undefined, icon: expense.category?.icon ?? undefined, amount: (prev?.amount ?? 0) + Number(expense.amount) * count });
    }
  }

  private minDate(dates: Date[]) {
    const valid = dates.filter((date) => date && !Number.isNaN(date.getTime()));
    if (!valid.length) return new Date(new Date().getFullYear(), 0, 1);
    return new Date(Math.min(...valid.map((date) => date.getTime())));
  }

  async summary(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const { start, end } = this.monthBounds();
    const today = new Date();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const [incomes, expenses, allExpensesToDate, recurringExpenseMarkers, recurring, credits] = await Promise.all([
      this.prisma.income.findMany({ where: { portfolioId } }),
      this.prisma.expense.findMany({
        where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { gte: start, lt: end } },
        include: { category: { select: { id: true, name: true, color: true, icon: true } } },
      }),
      this.prisma.expense.findMany({ where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { lt: todayEnd } } }),
      this.prisma.expense.findMany({
        where: { portfolioId, status: ExpenseStatus.CONFIRMED, comment: { contains: 'Период:' } },
        include: { category: { select: { id: true, name: true, color: true, icon: true } } },
      }),
      this.prisma.recurringPayment.findMany({
        where: { portfolioId, status: CreditStatus.ACTIVE },
        include: { category: { select: { id: true, name: true, color: true, icon: true } } },
      }),
      this.prisma.credit.findMany({ where: { portfolioId, status: CreditStatus.ACTIVE } }),
    ]);

    const firstDate = this.minDate([
      ...incomes.map((income) => income.date),
      ...allExpensesToDate.map((expense) => expense.date),
      ...recurring.map((item) => item.nextPaymentDate),
      ...recurringExpenseMarkers.map((expense) => this.parseAnchorDate(expense.comment) ?? expense.date),
      ...credits.map((credit) => credit.startDate ?? new Date(today.getFullYear(), today.getMonth(), credit.paymentDay)),
    ]);
    const allTimeStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);

    const scheduledIncome = this.incomeForRange(incomes, start, end);
    const allTimeIncomeToDate = this.incomeForRange(incomes, allTimeStart, todayEnd);
    const allTimeActualExpense = allExpensesToDate.reduce((s, e) => s + Number(e.amount), 0);
    const allTimeRecurringExpense = this.recurringForRange(recurring, allTimeStart, todayEnd)
      + this.recurringExpensesFromExpenseComments(recurringExpenseMarkers, recurring, allTimeStart, todayEnd);
    const allTimeCreditExpense = credits.reduce((sum, credit) => {
      const paymentDay = credit.paymentDay;
      const startDate = credit.startDate ?? new Date(allTimeStart.getFullYear(), allTimeStart.getMonth(), paymentDay);
      const count = this.countOccurrences({ startDate, recurrence: Recurrence.MONTHLY, rangeStart: allTimeStart, rangeEnd: todayEnd, paymentDay });
      return sum + Number(credit.monthlyPayment) * count;
    }, 0);

    const actualExpense = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const plannedExpense = this.recurringForRange(recurring, start, end) + this.recurringExpensesFromExpenseComments(recurringExpenseMarkers, recurring, start, end);
    const creditExpense = credits.reduce((s, c) => s + Number(c.monthlyPayment), 0);
    const totalIncome = scheduledIncome;
    const totalExpense = actualExpense + plannedExpense + creditExpense;
    const balance = totalIncome - totalExpense;
    const obligatory = plannedExpense + creditExpense;
    const availableNow = allTimeIncomeToDate - allTimeActualExpense - allTimeRecurringExpense - allTimeCreditExpense;

    const byCategoryMap = new Map<string, { id: string; name: string; color?: string; icon?: string; amount: number }>();
    for (const e of expenses) {
      const key = e.category?.id ?? 'none';
      const name = e.category?.name ?? 'Без категории';
      const prev = byCategoryMap.get(key);
      byCategoryMap.set(key, { id: key, name, color: e.category?.color ?? undefined, icon: e.category?.icon ?? undefined, amount: (prev?.amount ?? 0) + Number(e.amount) });
    }
    for (const r of recurring) {
      const count = this.countOccurrences({ startDate: r.nextPaymentDate, recurrence: r.recurrence, rangeStart: start, rangeEnd: end, text: r.comment, paymentDay: r.paymentDay });
      if (!count) continue;
      const key = r.category?.id ?? `recurring-${r.id}`;
      const name = r.category?.name ?? r.title;
      const prev = byCategoryMap.get(key);
      byCategoryMap.set(key, { id: key, name, color: r.category?.color ?? undefined, icon: r.category?.icon ?? undefined, amount: (prev?.amount ?? 0) + Number(r.amount) * count });
    }
    this.addRecurringExpenseCommentsToCategories(byCategoryMap, recurringExpenseMarkers, recurring, start, end);
    const byCategory = [...byCategoryMap.values()].sort((a, b) => b.amount - a.amount);

    const byMemberMap = new Map<string, number>();
    for (const e of expenses) byMemberMap.set(e.paidByUserId, (byMemberMap.get(e.paidByUserId) ?? 0) + Number(e.amount));
    const memberUsers = await this.prisma.user.findMany({ where: { id: { in: [...byMemberMap.keys()] } }, select: { id: true, name: true } });
    const byMember = memberUsers.map((u) => ({ userId: u.id, name: u.name, amount: byMemberMap.get(u.id) ?? 0 }));
    const personal = expenses.filter((e) => e.scope === ExpenseScope.PERSONAL).reduce((s, e) => s + Number(e.amount), 0);
    const shared = totalExpense - personal;
    const remainingRecurring = this.recurringForRange(recurring, todayEnd, end) + this.recurringExpensesFromExpenseComments(recurringExpenseMarkers, recurring, todayEnd, end);
    const remainingCredits = credits.filter((c) => c.paymentDay >= today.getDate()).reduce((s, c) => s + Number(c.monthlyPayment), 0);
    const remainingObligatory = remainingRecurring + remainingCredits;

    return {
      period: { from: start, to: end },
      totalIncome: Math.round(totalIncome),
      totalExpense: Math.round(totalExpense),
      actualExpense: Math.round(actualExpense),
      plannedExpense: Math.round(plannedExpense + creditExpense),
      balance: Math.round(balance),
      currentBalance: Math.round(availableNow),
      availableNow: Math.round(availableNow),
      allTimeIncome: Math.round(allTimeIncomeToDate),
      allTimeExpense: Math.round(allTimeActualExpense + allTimeRecurringExpense + allTimeCreditExpense),
      obligatoryTotal: Math.round(obligatory),
      remainingObligatory: Math.round(remainingObligatory),
      freeMoney: Math.round(availableNow),
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
    const [incomes, expenses, recurringExpenseMarkers, recurring, credits] = await Promise.all([
      this.prisma.income.findMany({ where: { portfolioId } }),
      this.prisma.expense.findMany({ where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { gte: from } } }),
      this.prisma.expense.findMany({ where: { portfolioId, status: ExpenseStatus.CONFIRMED, comment: { contains: 'Период:' } } }),
      this.prisma.recurringPayment.findMany({ where: { portfolioId, status: CreditStatus.ACTIVE } }),
      this.prisma.credit.findMany({ where: { portfolioId, status: CreditStatus.ACTIVE } }),
    ]);
    const buckets: Record<string, { month: string; income: number; expense: number }> = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[key] = { month: key, income: this.incomeForRange(incomes, d, next), expense: this.recurringForRange(recurring, d, next) + this.recurringExpensesFromExpenseComments(recurringExpenseMarkers, recurring, d, next) + credits.reduce((s, c) => s + Number(c.monthlyPayment), 0) };
    }
    const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    for (const e of expenses) if (buckets[keyOf(e.date)]) buckets[keyOf(e.date)].expense += Number(e.amount);
    return Object.values(buckets).map((b) => ({ month: b.month, income: Math.round(b.income), expense: Math.round(b.expense), balance: Math.round(b.income - b.expense) }));
  }

  async categories(portfolioId: string, userId: string) {
    const s = await this.summary(portfolioId, userId);
    return s.byCategory;
  }

  async forecast(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const { start, end } = this.monthBounds();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const [incomes, recurringExpenseMarkers, recurring, credits, currentMonthExpenses, variableExpenses] = await Promise.all([
      this.prisma.income.findMany({ where: { portfolioId } }),
      this.prisma.expense.findMany({ where: { portfolioId, status: ExpenseStatus.CONFIRMED, comment: { contains: 'Период:' } } }),
      this.prisma.recurringPayment.findMany({ where: { portfolioId, status: CreditStatus.ACTIVE } }),
      this.prisma.credit.findMany({ where: { portfolioId, status: CreditStatus.ACTIVE } }),
      this.prisma.expense.findMany({ where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { gte: start, lt: end } } }),
      this.prisma.expense.findMany({ where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { gte: new Date(start.getFullYear(), start.getMonth() - 3, 1), lt: start } } }),
    ]);
    const creditMonthly = credits.reduce((s, c) => s + Number(c.monthlyPayment), 0);
    const remainingCredits = credits.filter((c) => c.paymentDay >= now.getDate()).reduce((s, c) => s + Number(c.monthlyPayment), 0);
    const actualExpenseToDate = currentMonthExpenses.filter((e) => e.date < todayStart).reduce((s, e) => s + Number(e.amount), 0);
    const futureOneOffExpense = currentMonthExpenses.filter((e) => e.date >= todayStart).reduce((s, e) => s + Number(e.amount), 0);
    const actualIncomeToDate = this.incomeForRange(incomes, start, todayStart);
    const restIncome = this.incomeForRange(incomes, todayStart, end);
    const restRecurring = this.recurringForRange(recurring, todayStart, end) + this.recurringExpensesFromExpenseComments(recurringExpenseMarkers, recurring, todayStart, end);
    const restExpense = restRecurring + remainingCredits + futureOneOffExpense;
    const actualBalance = actualIncomeToDate - actualExpenseToDate;
    const endOfMonthBalance = actualBalance + restIncome - restExpense;
    let expectedIncome = 0;
    let obligatory = 0;
    for (let i = 0; i < 6; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      expectedIncome += this.incomeForRange(incomes, d, next);
      obligatory += this.recurringForRange(recurring, d, next) + this.recurringExpensesFromExpenseComments(recurringExpenseMarkers, recurring, d, next) + creditMonthly;
    }
    expectedIncome = expectedIncome / 6;
    obligatory = obligatory / 6;
    const avgVariable = variableExpenses.reduce((s, e) => s + Number(e.amount), 0) / 3;
    const monthlyForecast = expectedIncome - obligatory - avgVariable;
    const horizon = (m: number) => Math.round(monthlyForecast * m);
    return {
      actualToDate: { income: Math.round(actualIncomeToDate), expense: Math.round(actualExpenseToDate), balance: Math.round(actualBalance) },
      restOfMonth: { income: Math.round(restIncome), expense: Math.round(restExpense), recurring: Math.round(restRecurring), credits: Math.round(remainingCredits), oneOff: Math.round(futureOneOffExpense) },
      expectedIncome: Math.round(expectedIncome),
      obligatory: Math.round(obligatory),
      avgVariableExpense: Math.round(avgVariable),
      endOfMonthBalance: Math.round(endOfMonthBalance),
      forecast: { currentMonth: Math.round(monthlyForecast), in3Months: horizon(3), in6Months: horizon(6), in12Months: horizon(12) },
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
      credits: credits.map((c) => ({ id: c.id, title: c.title, remaining: Math.round(Number(c.remainingAmount)), monthlyPayment: Math.round(Number(c.monthlyPayment)), monthsLeft: Number(c.monthlyPayment) > 0 ? Math.ceil(Number(c.remainingAmount) / Number(c.monthlyPayment)) : 0 })),
    };
  }
}
