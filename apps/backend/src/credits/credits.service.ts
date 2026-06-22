import { Injectable, NotFoundException } from '@nestjs/common';
import { CreditStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';
import { CreateCreditDto, UpdateCreditDto } from './dto/credit.dto';

@Injectable()
export class CreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
  ) {}

  async create(userId: string, dto: CreateCreditDto) {
    await this.access.require(dto.portfolioId, userId, 'add');
    const credit = await this.prisma.credit.create({
      data: {
        portfolioId: dto.portfolioId,
        userId: dto.userId ?? userId,
        title: dto.title,
        bankName: dto.bankName,
        initialAmount: dto.initialAmount,
        remainingAmount: dto.remainingAmount,
        monthlyPayment: dto.monthlyPayment,
        interestRate: dto.interestRate,
        paymentDay: dto.paymentDay,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        comment: dto.comment,
      },
    });
    return this.withSchedule(credit);
  }

  async list(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const credits = await this.prisma.credit.findMany({
      where: { portfolioId },
      orderBy: { createdAt: 'asc' },
    });
    return credits.map((c) => this.withSchedule(c));
  }

  async update(id: string, userId: string, dto: UpdateCreditDto) {
    const credit = await this.prisma.credit.findUnique({ where: { id } });
    if (!credit) throw new NotFoundException('Кредит не найден');
    await this.access.require(credit.portfolioId, userId, 'edit');
    const updated = await this.prisma.credit.update({
      where: { id },
      data: { ...dto, endDate: dto.endDate ? new Date(dto.endDate) : undefined },
    });
    return this.withSchedule(updated);
  }

  async remove(id: string, userId: string) {
    const credit = await this.prisma.credit.findUnique({ where: { id } });
    if (!credit) throw new NotFoundException('Кредит не найден');
    await this.access.require(credit.portfolioId, userId, 'edit');
    await this.prisma.credit.delete({ where: { id } });
    return { success: true };
  }

  /** Добавляет вычисляемый график платежей (§12.2, §17.3). */
  private withSchedule(c: Awaited<ReturnType<PrismaService['credit']['findUnique']>>) {
    if (!c) return c;
    const monthly = Number(c.monthlyPayment);
    const remaining = Number(c.remainingAmount);
    const monthsLeft = monthly > 0 ? Math.ceil(remaining / monthly) : 0;

    const now = new Date();
    const nextPaymentDate = new Date(now.getFullYear(), now.getMonth(), c.paymentDay);
    if (nextPaymentDate < now) nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

    const isOverdue = c.status === CreditStatus.ACTIVE && remaining > 0 && false; // place for real overdue calc

    return {
      ...c,
      schedule: {
        nextPaymentDate,
        nextPaymentAmount: Math.min(monthly, remaining),
        remainingAmount: remaining,
        monthsLeft,
        totalFuturePayments: Math.round(monthly * monthsLeft),
        projectedCloseDate: monthsLeft
          ? new Date(now.getFullYear(), now.getMonth() + monthsLeft, c.paymentDay)
          : c.endDate,
        isOverdue,
      },
    };
  }
}
