import { Injectable } from '@nestjs/common';
import { ExpenseStatus, Recurrence } from '@prisma/client';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';
import { PrismaService } from '../prisma/prisma.service';

interface BalanceAuditOptions {
  actualBalance?: number;
  asOf?: Date;
}

@Injectable()
export class BalanceEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
  ) {}

  async audit(portfolioId: string, userId: string, options: BalanceAuditOptions = {}) {
    await this.access.requireMember(portfolioId, userId);
    const asOf = options.asOf ?? new Date();
    const end = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() + 1);

    const [portfolio, incomes, expenses, recurring, credits] = await Promise.all([
      this.prisma.portfolio.findUniqueOrThrow({ where: { id: portfolioId } }),
      this.prisma.income.findMany({
        where: { portfolioId, isForecast: false },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { lt: end } },
        include: {
          category: { select: { id: true, name: true } },
          paidBy: { select: { id: true, name: true } },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.recurringPayment.findMany({ where: { portfolioId, status: 'ACTIVE' } }),
      this.prisma.credit.findMany({ where: { portfolioId, status: 'ACTIVE' } }),
    ]);

    const openingBalance = Number(portfolio.currentBalance);
    const actualIncomeEntries = incomes.flatMap((income) => this.actualIncomeEntries(income, end));
    const incomeTotal = actualIncomeEntries.reduce((sum, item) => sum + item.amount, 0);
    const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
    const calculatedBalance = openingBalance + incomeTotal - expenseTotal;
    const actualBalance = Number.isFinite(options.actualBalance) ? Number(options.actualBalance) : null;
    const difference = actualBalance == null ? null : actualBalance - calculatedBalance;

    const duplicateExpenses = this.findDuplicateExpenses(expenses);
    const duplicateIncomes = this.findDuplicateIncomes(actualIncomeEntries);
    const warnings: Array<{ code: string; message: string; amount?: number }> = [];

    if (openingBalance === 0 && expenses.length + actualIncomeEntries.length > 0) {
      warnings.push({
        code: 'OPENING_BALANCE_ZERO',
        message: 'Начальный остаток портфеля равен нулю. Если учёт начался не с пустых счетов, расчёт никогда не совпадёт с банком.',
      });
    }
    if (difference != null && Math.abs(difference) >= 1) {
      warnings.push({
        code: 'RECONCILIATION_GAP',
        message: difference > 0
          ? 'В банке денег больше, чем рассчитано приложением. Вероятны отсутствующий начальный остаток, невнесённый доход или лишний расход.'
          : 'В приложении денег больше, чем в банке. Вероятны пропущенный расход или лишний доход.',
        amount: Math.round(difference * 100) / 100,
      });
    }
    if (duplicateExpenses.length) warnings.push({ code: 'POSSIBLE_EXPENSE_DUPLICATES', message: `Найдено возможных дублей расходов: ${duplicateExpenses.length}.` });
    if (duplicateIncomes.length) warnings.push({ code: 'POSSIBLE_INCOME_DUPLICATES', message: `Найдено возможных дублей доходов: ${duplicateIncomes.length}.` });

    return {
      asOf: end,
      portfolio: { id: portfolio.id, name: portfolio.name, currency: portfolio.currency },
      formula: {
        openingBalance: this.money(openingBalance),
        confirmedIncome: this.money(incomeTotal),
        confirmedExpense: this.money(expenseTotal),
        calculatedBalance: this.money(calculatedBalance),
        actualBalance: actualBalance == null ? null : this.money(actualBalance),
        difference: difference == null ? null : this.money(difference),
      },
      counts: {
        incomeEntries: actualIncomeEntries.length,
        expenseEntries: expenses.length,
        recurringPlans: recurring.length,
        activeCredits: credits.length,
        possibleExpenseDuplicates: duplicateExpenses.length,
        possibleIncomeDuplicates: duplicateIncomes.length,
      },
      duplicates: {
        expenses: duplicateExpenses.slice(0, 20),
        incomes: duplicateIncomes.slice(0, 20),
      },
      warnings,
      notes: [
        'Регулярные платежи и кредиты не уменьшают текущий баланс сами по себе. Они учитываются только после появления подтверждённого расхода.',
        'Регулярный доход входит в текущий баланс только после подтверждения конкретного поступления.',
        'Инвестиционный или накопительный счёт можно включить в фактический остаток при сверке как часть общей суммы счетов.',
      ],
    };
  }

  async current(portfolioId: string, userId: string) {
    const audit = await this.audit(portfolioId, userId);
    return {
      currentBalance: audit.formula.calculatedBalance,
      openingBalance: audit.formula.openingBalance,
      confirmedIncome: audit.formula.confirmedIncome,
      confirmedExpense: audit.formula.confirmedExpense,
    };
  }

  private actualIncomeEntries(income: any, end: Date) {
    const amount = Number(income.amount);
    if (income.recurrence === Recurrence.ONE_TIME) {
      if (income.date >= end) return [];
      return [{
        id: income.id,
        sourceId: income.id,
        amount,
        date: income.date,
        userId: income.userId,
        userName: income.user?.name ?? null,
        title: income.description ?? income.type,
      }];
    }

    const confirmedDates = this.confirmedDates(income.description).filter((date) => date < end);
    return confirmedDates.map((date, index) => ({
      id: `${income.id}:${index}:${date.toISOString().slice(0, 10)}`,
      sourceId: income.id,
      amount,
      date,
      userId: income.userId,
      userName: income.user?.name ?? null,
      title: income.description ?? income.type,
    }));
  }

  private confirmedDates(description?: string | null) {
    const matches = Array.from(String(description ?? '').matchAll(/\[confirmed:(\d{4}-\d{2}-\d{2})\]/g));
    return matches
      .map((match) => new Date(`${match[1]}T00:00:00`))
      .filter((date) => !Number.isNaN(date.getTime()));
  }

  private findDuplicateExpenses(expenses: any[]) {
    const groups = new Map<string, any[]>();
    for (const expense of expenses) {
      const key = [
        this.dateKey(expense.date),
        this.money(Number(expense.amount)),
        this.normalizedText(expense.title ?? expense.merchant ?? expense.description ?? expense.category?.name),
        expense.paidByUserId,
      ].join('|');
      const group = groups.get(key) ?? [];
      group.push(expense);
      groups.set(key, group);
    }
    return [...groups.values()].filter((group) => group.length > 1).map((group) => ({
      date: this.dateKey(group[0].date),
      amount: this.money(Number(group[0].amount)),
      title: group[0].title ?? group[0].merchant ?? group[0].description ?? group[0].category?.name ?? 'Расход',
      count: group.length,
      ids: group.map((item) => item.id),
    }));
  }

  private findDuplicateIncomes(entries: any[]) {
    const groups = new Map<string, any[]>();
    for (const entry of entries) {
      const key = [this.dateKey(entry.date), this.money(entry.amount), this.normalizedText(entry.title), entry.userId].join('|');
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
    return [...groups.values()].filter((group) => group.length > 1).map((group) => ({
      date: this.dateKey(group[0].date),
      amount: this.money(group[0].amount),
      title: group[0].title ?? 'Доход',
      count: group.length,
      ids: group.map((item) => item.id),
    }));
  }

  private normalizedText(value?: string | null) {
    return String(value ?? '')
      .replace(/\[[^\]]+\]/g, '')
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, ' ')
      .trim();
  }

  private dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private money(value: number) {
    return Math.round(value * 100) / 100;
  }
}
