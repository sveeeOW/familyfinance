import { Injectable } from '@nestjs/common';
import { Recurrence, ExpenseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';

@Injectable()
export class ForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
  ) {}

  private monthBounds(date = new Date()) {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
    };
  }

  private startOfNextDay(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
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

  private parseAnchor(text?: string | null): Date | null {
    const value = text?.split('[anchor:')[1]?.split(']')[0];
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private addPeriod(date: Date, recurrence: Recurrence, text?: string | null) {
    const next = new Date(date);
    const custom = this.parseCustomPeriod(text);
    if (recurrence === Recurrence.WEEKLY) next.setDate(next.getDate() + 7);
    else if (recurrence === Recurrence.TWICE_A_MONTH) next.setDate(next.getDate() + 14);
    else if (recurrence === Recurrence.CUSTOM || custom) {
      if (!custom) next.setMonth(next.getMonth() + 1);
      else if (custom.unit === 'DAY') next.setDate(next.getDate() + custom.interval);
      else if (custom.unit === 'WEEK') next.setDate(next.getDate() + custom.interval * 7);
      else next.setMonth(next.getMonth() + custom.interval);
    } else next.setMonth(next.getMonth() + 1);
    return next;
  }

  private countOccurrences(params: { startDate: Date; recurrence: Recurrence; start: Date; end: Date; text?: string | null }) {
    let current = this.parseAnchor(params.text) ?? new Date(params.startDate);
    if (Number.isNaN(current.getTime())) return 0;
    if (params.recurrence === Recurrence.ONE_TIME) return current >= params.start && current < params.end ? 1 : 0;

    let count = 0;
    let guard = 0;
    while (current < params.end && guard < 1000) {
      if (current >= params.start) count += 1;
      current = this.addPeriod(current, params.recurrence, params.text);
      guard += 1;
    }
    return count;
  }

  private incomeForRange(incomes: any[], start: Date, end: Date) {
    return incomes.reduce((sum, income) => {
      const count = this.countOccurrences({ startDate: income.date, recurrence: income.recurrence, start, end, text: income.description });
      return sum + Number(income.amount) * count;
    }, 0);
  }

  private recurringForRange(items: any[], start: Date, end: Date) {
    return items.reduce((sum, item) => {
      const count = this.countOccurrences({ startDate: item.nextPaymentDate, recurrence: item.recurrence, start, end, text: item.comment });
      return sum + Number(item.amount) * count;
    }, 0);
  }

  private creditsForRange(credits: any[], start: Date, end: Date) {
    return credits.reduce((sum, credit) => {
      const day = Math.max(1, Math.min(31, Number(credit.paymentDay ?? 1)));
      let cursor = new Date(start.getFullYear(), start.getMonth(), day);
      let total = 0;
      let guard = 0;
      while (cursor < end && guard < 24) {
        if (cursor >= start) total += Number(credit.monthlyPayment);
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, day);
        guard += 1;
      }
      return sum + total;
    }, 0);
  }

  private factualExpensesForRange(expenses: any[], start: Date, end: Date) {
    return expenses.filter((e) => e.date >= start && e.date < end).reduce((sum, expense) => sum + Number(expense.amount), 0);
  }

  async forecast(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const { start, end } = this.monthBounds();
    const todayEnd = this.startOfNextDay();

    const [incomes, recurring, credits, monthExpenses, variableExpenses] = await Promise.all([
      this.prisma.income.findMany({ where: { portfolioId } }),
      this.prisma.recurringPayment.findMany({ where: { portfolioId } }),
      this.prisma.credit.findMany({ where: { portfolioId } }),
      this.prisma.expense.findMany({ where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { gte: start, lt: end } } }),
      this.prisma.expense.findMany({ where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { gte: new Date(start.getFullYear(), start.getMonth() - 3, 1), lt: start } } }),
    ]);

    const incomeToDate = this.incomeForRange(incomes, start, todayEnd);
    const expenseToDate = this.factualExpensesForRange(monthExpenses, start, todayEnd) + this.recurringForRange(recurring, start, todayEnd) + this.creditsForRange(credits, start, todayEnd);
    const currentBalance = incomeToDate - expenseToDate;

    const incomeRest = this.incomeForRange(incomes, todayEnd, end);
    const expenseRest = this.factualExpensesForRange(monthExpenses, todayEnd, end) + this.recurringForRange(recurring, todayEnd, end) + this.creditsForRange(credits, todayEnd, end);
    const endOfMonthBalance = currentBalance + incomeRest - expenseRest;

    let expectedIncome = 0;
    let obligatory = 0;
    for (let i = 0; i < 6; i += 1) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      expectedIncome += this.incomeForRange(incomes, d, next);
      obligatory += this.recurringForRange(recurring, d, next) + this.creditsForRange(credits, d, next);
    }
    expectedIncome = expectedIncome / 6;
    obligatory = obligatory / 6;
    const avgVariable = variableExpenses.reduce((s, e) => s + Number(e.amount), 0) / 3;
    const monthlyForecast = expectedIncome - obligatory - avgVariable;
    const horizon = (m: number) => Math.round(monthlyForecast * m);

    return {
      actualToDate: { income: Math.round(incomeToDate), expense: Math.round(expenseToDate), balance: Math.round(currentBalance), until: todayEnd },
      restOfMonth: { income: Math.round(incomeRest), expense: Math.round(expenseRest) },
      expectedIncome: Math.round(incomeRest),
      obligatory: Math.round(expenseRest),
      avgVariableExpense: Math.round(avgVariable),
      endOfMonthBalance: Math.round(endOfMonthBalance),
      forecast: { currentMonth: Math.round(endOfMonthBalance), in3Months: horizon(3), in6Months: horizon(6), in12Months: horizon(12) },
    };
  }
}
