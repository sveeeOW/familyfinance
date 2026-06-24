import { Injectable, NotFoundException } from '@nestjs/common';
import { Recurrence } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';
import { CreateRecurringDto, UpdateRecurringDto } from './dto/recurring.dto';

@Injectable()
export class RecurringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
  ) {}

  /** Вычисляет ближайшую дату платежа по числу месяца. */
  static nextDate(paymentDay: number, from = new Date()): Date {
    const d = new Date(from.getFullYear(), from.getMonth(), paymentDay);
    if (d < from) d.setMonth(d.getMonth() + 1);
    return d;
  }

  private static anchorDate(comment?: string | null): Date | null {
    const raw = comment?.split('[anchor:')[1]?.split(']')[0];
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  async create(userId: string, dto: CreateRecurringDto) {
    await this.access.require(dto.portfolioId, userId, 'add');
    return this.prisma.recurringPayment.create({
      data: {
        portfolioId: dto.portfolioId,
        userId: dto.userId ?? userId,
        categoryId: dto.categoryId,
        title: dto.title,
        amount: dto.amount,
        paymentDay: dto.paymentDay,
        recurrence: dto.recurrence ?? Recurrence.MONTHLY,
        nextPaymentDate: RecurringService.anchorDate(dto.comment) ?? RecurringService.nextDate(dto.paymentDay),
        paymentMethod: dto.paymentMethod,
        reminderDays: dto.reminderDays ?? [7, 3, 1, 0],
        comment: dto.comment,
      },
    });
  }

  async list(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    return this.prisma.recurringPayment.findMany({
      where: { portfolioId },
      include: { category: { select: { id: true, name: true, icon: true, color: true } } },
      orderBy: { nextPaymentDate: 'asc' },
    });
  }

  async update(id: string, userId: string, dto: UpdateRecurringDto) {
    const item = await this.prisma.recurringPayment.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Регулярный платёж не найден');
    await this.access.require(item.portfolioId, userId, 'edit');
    return this.prisma.recurringPayment.update({
      where: { id },
      data: {
        ...dto,
        nextPaymentDate: RecurringService.anchorDate(dto.comment) ?? (dto.paymentDay ? RecurringService.nextDate(dto.paymentDay) : undefined),
      },
    });
  }

  async remove(id: string, userId: string) {
    const item = await this.prisma.recurringPayment.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Регулярный платёж не найден');
    await this.access.require(item.portfolioId, userId, 'edit');
    await this.prisma.recurringPayment.delete({ where: { id } });
    return { success: true };
  }
}
