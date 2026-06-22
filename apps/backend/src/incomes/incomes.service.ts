import { Injectable, NotFoundException } from '@nestjs/common';
import { Recurrence } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';
import { CreateIncomeDto, UpdateIncomeDto } from './dto/income.dto';

@Injectable()
export class IncomesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
  ) {}

  async create(userId: string, dto: CreateIncomeDto) {
    await this.access.require(dto.portfolioId, userId, 'add');
    return this.prisma.income.create({
      data: {
        portfolioId: dto.portfolioId,
        userId,
        type: dto.type,
        amount: dto.amount,
        currency: dto.currency ?? 'RUB',
        date: new Date(dto.date),
        recurrence: dto.recurrence ?? Recurrence.MONTHLY,
        paymentDay: dto.paymentDay,
        description: dto.description,
      },
    });
  }

  async list(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    return this.prisma.income.findMany({
      where: { portfolioId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });
  }

  async update(id: string, userId: string, dto: UpdateIncomeDto) {
    const income = await this.prisma.income.findUnique({ where: { id } });
    if (!income) throw new NotFoundException('Доход не найден');
    await this.access.require(income.portfolioId, userId, 'edit');
    return this.prisma.income.update({
      where: { id },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  async remove(id: string, userId: string) {
    const income = await this.prisma.income.findUnique({ where: { id } });
    if (!income) throw new NotFoundException('Доход не найден');
    await this.access.require(income.portfolioId, userId, 'edit');
    await this.prisma.income.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Прогноз дохода (§7.3). Складывает регулярные доходы по месяцам на N месяцев вперёд
   * с учётом периодичности. Разовые доходы не проецируются.
   */
  async forecast(portfolioId: string, userId: string, months = 6) {
    await this.access.requireMember(portfolioId, userId);
    const incomes = await this.prisma.income.findMany({ where: { portfolioId } });

    const monthlyEquivalent = (amount: number, recurrence: Recurrence): number => {
      switch (recurrence) {
        case Recurrence.MONTHLY:
          return amount;
        case Recurrence.TWICE_A_MONTH:
          return amount * 2;
        case Recurrence.WEEKLY:
          return amount * 4.33;
        default:
          return 0; // ONE_TIME / CUSTOM не проецируем
      }
    };

    const recurringPerMonth = incomes.reduce(
      (sum, i) => sum + monthlyEquivalent(Number(i.amount), i.recurrence),
      0,
    );

    const now = new Date();
    const periods: { month: string; expected: number }[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      // К первому (текущему) месяцу добавляем уже учтённые разовые доходы этого месяца.
      const oneTimeThisMonth =
        i === 0
          ? incomes
              .filter(
                (inc) =>
                  inc.recurrence === Recurrence.ONE_TIME &&
                  inc.date.getFullYear() === d.getFullYear() &&
                  inc.date.getMonth() === d.getMonth(),
              )
              .reduce((s, inc) => s + Number(inc.amount), 0)
          : 0;
      periods.push({ month: monthKey, expected: Math.round(recurringPerMonth + oneTimeThisMonth) });
    }

    return { recurringPerMonth: Math.round(recurringPerMonth), months: periods };
  }
}
