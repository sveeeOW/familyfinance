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

  /**
   * Прогноз дохода: регулярные доходы считаются как расписание.
   * MONTHLY берёт paymentDay, а CUSTOM — дату ближайшей выплаты + [period:N:UNIT].
   */
  async forecast(portfolioId: string, userId: string, months = 6) {
    await this.access.requireMember(portfolioId, userId);
    const incomes = await this.prisma.income.findMany({ where: { portfolioId } });

    const now = new Date();
    const periods: { month: string; expected: number }[] = [];
    for (let i = 0; i < months; i++) {
      const start = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const monthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      const expected = incomes.reduce((sum, income) => {
        const count = this.countOccurrences({
          startDate: income.date,
          recurrence: income.recurrence,
          rangeStart: start,
          rangeEnd: end,
          text: income.description,
          paymentDay: income.paymentDay ?? income.date.getDate(),
        });
        return sum + Number(income.amount) * count;
      }, 0);
      periods.push({ month: monthKey, expected: Math.round(expected) });
    }

    const recurringPerMonth = periods.length ? periods.reduce((s, p) => s + p.expected, 0) / periods.length : 0;
    return { recurringPerMonth: Math.round(recurringPerMonth), months: periods };
  }
}
