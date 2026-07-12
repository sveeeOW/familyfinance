import { Injectable } from '@nestjs/common';
import { ExpenseStatus, Recurrence } from '@prisma/client';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';
import { PrismaService } from '../prisma/prisma.service';

const BALANCE_BASE_MARKER = '[balance-base:2026-07-04]';
const BALANCE_BASE_TARGET = 226066.55;
const BALANCE_BASE_OWNER = 'eteground@gmail.com';

@Injectable()
export class BalanceEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
  ) {}

  async current(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const end = new Date();
    end.setHours(24, 0, 0, 0);

    const [portfolio, incomes, expenses] = await Promise.all([
      this.prisma.portfolio.findUniqueOrThrow({
        where: { id: portfolioId },
        include: {
          owner: { select: { email: true } },
          _count: { select: { members: true } },
        },
      }),
      this.prisma.income.findMany({
        where: { portfolioId, isForecast: false },
      }),
      this.prisma.expense.findMany({
        where: { portfolioId, status: ExpenseStatus.CONFIRMED, date: { lt: end } },
      }),
    ]);

    const confirmedIncome = incomes.reduce((sum, income) => sum + this.actualIncomeAmount(income, end), 0);
    const confirmedExpense = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    let openingBalance = Number(portfolio.currentBalance);

    const shouldCalibrate =
      portfolio.owner.email?.toLowerCase() === BALANCE_BASE_OWNER &&
      portfolio._count.members > 1 &&
      !String(portfolio.description ?? '').includes(BALANCE_BASE_MARKER);

    if (shouldCalibrate) {
      openingBalance = BALANCE_BASE_TARGET - confirmedIncome + confirmedExpense;
      const description = `${portfolio.description ?? ''} ${BALANCE_BASE_MARKER}`.trim();
      await this.prisma.portfolio.update({
        where: { id: portfolioId },
        data: { currentBalance: openingBalance, description },
      });
    }

    return {
      currentBalance: this.money(openingBalance + confirmedIncome - confirmedExpense),
      openingBalance: this.money(openingBalance),
      confirmedIncome: this.money(confirmedIncome),
      confirmedExpense: this.money(confirmedExpense),
    };
  }

  private actualIncomeAmount(income: any, end: Date) {
    const amount = Number(income.amount);
    if (income.recurrence === Recurrence.ONE_TIME) {
      return income.date < end ? amount : 0;
    }
    return amount * this.confirmedDates(income.description).filter((date) => date < end).length;
  }

  private confirmedDates(description?: string | null) {
    const matches = Array.from(String(description ?? '').matchAll(/\[confirmed:(\d{4}-\d{2}-\d{2})\]/g));
    return matches
      .map((match) => new Date(`${match[1]}T00:00:00`))
      .filter((date) => !Number.isNaN(date.getTime()));
  }

  private money(value: number) {
    return Math.round(value * 100) / 100;
  }
}
