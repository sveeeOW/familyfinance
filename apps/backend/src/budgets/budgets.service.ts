import { Injectable, NotFoundException } from '@nestjs/common';
import { BudgetScope, ExpenseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';
import { CreateBudgetDto } from './dto/budget.dto';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
  ) {}

  async create(userId: string, dto: CreateBudgetDto) {
    await this.access.require(dto.portfolioId, userId, 'manage');
    return this.prisma.budget.create({
      data: {
        portfolioId: dto.portfolioId,
        scope: dto.scope,
        categoryId: dto.categoryId,
        userId: dto.userId,
        limitAmount: dto.limitAmount,
        warnPercent: dto.warnPercent ?? 80,
      },
    });
  }

  async remove(id: string, userId: string) {
    const budget = await this.prisma.budget.findUnique({ where: { id } });
    if (!budget) throw new NotFoundException('Лимит не найден');
    await this.access.require(budget.portfolioId, userId, 'manage');
    await this.prisma.budget.delete({ where: { id } });
    return { success: true };
  }

  /** Список лимитов с текущим расходом за месяц и статусом (ok / warn / over). */
  async listWithUsage(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const budgets = await this.prisma.budget.findMany({
      where: { portfolioId },
      include: { user: { select: { id: true, name: true } } },
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const result: Array<(typeof budgets)[number] & { used: number; percent: number; status: string }> = [];
    for (const b of budgets) {
      const spent = await this.prisma.expense.aggregate({
        _sum: { amount: true },
        where: {
          portfolioId,
          status: ExpenseStatus.CONFIRMED,
          date: { gte: monthStart },
          categoryId: b.scope === BudgetScope.CATEGORY ? b.categoryId ?? undefined : undefined,
          paidByUserId: b.scope === BudgetScope.MEMBER ? b.userId ?? undefined : undefined,
        },
      });
      const used = Number(spent._sum.amount ?? 0);
      const limit = Number(b.limitAmount);
      const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
      const status = percent >= 100 ? 'over' : percent >= b.warnPercent ? 'warn' : 'ok';
      result.push({ ...b, used, percent, status });
    }
    return result;
  }
}
