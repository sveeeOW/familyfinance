import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ExpenseScope,
  ExpenseSource,
  ExpenseStatus,
  MemberStatus,
  Prisma,
  SplitType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';
import { CategorizationService } from '../categorization/categorization.service';
import { computeShares } from './split.util';
import {
  ClarifyExpenseDto,
  CreateExpenseDto,
  UpdateExpenseDto,
} from './dto/expense.dto';

export interface ExpenseFilter {
  portfolioId: string;
  categoryId?: string;
  userId?: string; // фильтр по участнику
  status?: ExpenseStatus;
  from?: string;
  to?: string;
  search?: string;
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
    private readonly categorization: CategorizationService,
  ) {}

  // ─── Создание вручную (§8.3) ──────────────────────────────────────────────
  async create(userId: string, dto: CreateExpenseDto) {
    await this.access.require(dto.portfolioId, userId, 'add');
    return this.persist({
      portfolioId: dto.portfolioId,
      enteredByUserId: userId,
      paidByUserId: dto.paidByUserId ?? userId,
      amount: dto.amount,
      currency: dto.currency,
      date: dto.date ? new Date(dto.date) : new Date(),
      categoryId: dto.categoryId,
      title: dto.title,
      description: dto.description,
      merchant: dto.merchant,
      scope: dto.scope ?? ExpenseScope.SHARED,
      splitType: dto.splitType ?? SplitType.NONE,
      shares: dto.shares,
      source: ExpenseSource.MANUAL,
      status: ExpenseStatus.CONFIRMED,
      paymentMethod: dto.paymentMethod,
      comment: dto.comment,
      screenshotUrl: dto.screenshotUrl,
    });
  }

  /**
   * Создание расхода из результата AI-распознавания (Telegram/скан).
   * Статус зависит от уверенности (§11.3).
   */
  async createFromRecognition(params: {
    portfolioId: string;
    enteredByUserId: string;
    paidByUserId: string;
    amount: number;
    currency?: string;
    date?: Date;
    categoryId?: string | null;
    merchant?: string | null;
    description?: string | null;
    source: ExpenseSource;
    status: ExpenseStatus;
    confidence?: number;
    screenshotUrl?: string | null;
  }) {
    return this.persist({
      portfolioId: params.portfolioId,
      enteredByUserId: params.enteredByUserId,
      paidByUserId: params.paidByUserId,
      amount: params.amount,
      currency: params.currency,
      date: params.date ?? new Date(),
      categoryId: params.categoryId ?? undefined,
      title: params.merchant ?? undefined,
      description: params.description ?? undefined,
      merchant: params.merchant ?? undefined,
      scope: ExpenseScope.SHARED,
      splitType: SplitType.NONE,
      source: params.source,
      status: params.status,
      aiConfidence: params.confidence,
      screenshotUrl: params.screenshotUrl ?? undefined,
    });
  }

  private async persist(p: {
    portfolioId: string;
    enteredByUserId: string;
    paidByUserId: string;
    amount: number;
    currency?: string;
    date: Date;
    categoryId?: string;
    title?: string;
    description?: string;
    merchant?: string;
    scope: ExpenseScope;
    splitType: SplitType;
    shares?: CreateExpenseDto['shares'];
    source: ExpenseSource;
    status: ExpenseStatus;
    aiConfidence?: number;
    paymentMethod?: string;
    comment?: string;
    screenshotUrl?: string;
  }) {
    let computed: ReturnType<typeof computeShares> = [];
    if (p.scope === ExpenseScope.SHARED && p.splitType !== SplitType.NONE) {
      const members = await this.prisma.portfolioMember.findMany({
        where: { portfolioId: p.portfolioId, status: MemberStatus.ACTIVE },
        select: { userId: true },
      });
      computed = computeShares(
        p.splitType,
        p.amount,
        members.map((m) => m.userId),
        p.shares,
      );
    }

    const expense = await this.prisma.expense.create({
      data: {
        portfolioId: p.portfolioId,
        userId: p.enteredByUserId,
        paidByUserId: p.paidByUserId,
        categoryId: p.categoryId,
        amount: p.amount,
        currency: p.currency ?? 'RUB',
        date: p.date,
        title: p.title,
        description: p.description,
        merchant: p.merchant,
        scope: p.scope,
        splitType: p.splitType,
        source: p.source,
        status: p.status,
        aiConfidence: p.aiConfidence,
        paymentMethod: p.paymentMethod,
        comment: p.comment,
        screenshotUrl: p.screenshotUrl,
        shares: computed.length
          ? {
              create: computed.map((s) => ({
                userId: s.userId,
                amount: s.amount,
                percent: s.percent ?? undefined,
                // доля плательщика считается уже погашенной
                settled: s.userId === p.paidByUserId,
              })),
            }
          : undefined,
      },
      include: { shares: true, category: true },
    });

    await this.audit(p.enteredByUserId, expense.id, 'create');
    return expense;
  }

  // ─── Чтение и фильтры (§14.4) ─────────────────────────────────────────────
  async list(userId: string, filter: ExpenseFilter) {
    await this.access.requireMember(filter.portfolioId, userId);
    const where: Prisma.ExpenseWhereInput = {
      portfolioId: filter.portfolioId,
      categoryId: filter.categoryId,
      paidByUserId: filter.userId,
      status: filter.status,
      date:
        filter.from || filter.to
          ? { gte: filter.from ? new Date(filter.from) : undefined, lte: filter.to ? new Date(filter.to) : undefined }
          : undefined,
      OR: filter.search
        ? [
            { description: { contains: filter.search, mode: 'insensitive' } },
            { title: { contains: filter.search, mode: 'insensitive' } },
            { merchant: { contains: filter.search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    return this.prisma.expense.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        paidBy: { select: { id: true, name: true } },
        shares: true,
      },
      orderBy: { date: 'desc' },
      take: 200,
    });
  }

  /** Расходы со статусом «Требует уточнения» (§14.8). */
  async needsClarification(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    return this.prisma.expense.findMany({
      where: {
        portfolioId,
        status: { in: [ExpenseStatus.NEEDS_CLARIFICATION, ExpenseStatus.PENDING] },
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string, userId: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { category: true, shares: true, paidBy: { select: { id: true, name: true } } },
    });
    if (!expense) throw new NotFoundException('Расход не найден');
    await this.access.requireMember(expense.portfolioId, userId);
    return expense;
  }

  async update(id: string, userId: string, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Расход не найден');
    await this.access.require(expense.portfolioId, userId, 'edit');

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { ...dto, date: dto.date ? new Date(dto.date) : undefined },
      include: { category: true },
    });

    // Если изменили категорию — обучаем правило (§11.4).
    if (dto.categoryId && dto.categoryId !== expense.categoryId && expense.merchant) {
      await this.categorization.learn({
        keyword: expense.merchant,
        categoryId: dto.categoryId,
        userId,
        portfolioId: expense.portfolioId,
      });
    }
    await this.audit(userId, id, 'update', dto);
    return updated;
  }

  async remove(id: string, userId: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Расход не найден');
    await this.access.require(expense.portfolioId, userId, 'edit');
    await this.prisma.expense.delete({ where: { id } });
    await this.audit(userId, id, 'delete');
    return { success: true };
  }

  // ─── Подтверждение / уточнение (§19.5, §11) ───────────────────────────────
  async confirm(id: string, userId: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Расход не найден');
    await this.access.require(expense.portfolioId, userId, 'add');

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { status: ExpenseStatus.CONFIRMED },
      include: { category: true },
    });
    if (expense.merchant && expense.categoryId) {
      await this.categorization.learn({
        keyword: expense.merchant,
        categoryId: expense.categoryId,
        userId,
        portfolioId: expense.portfolioId,
      });
    }
    await this.audit(userId, id, 'confirm');
    return updated;
  }

  async clarify(id: string, userId: string, dto: ClarifyExpenseDto) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Расход не найден');
    await this.access.require(expense.portfolioId, userId, 'add');

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        categoryId: dto.categoryId ?? expense.categoryId,
        comment: dto.comment ?? expense.comment,
        status: ExpenseStatus.CONFIRMED,
      },
      include: { category: true },
    });

    if (dto.categoryId && expense.merchant) {
      await this.categorization.learn({
        keyword: expense.merchant,
        categoryId: dto.categoryId,
        userId,
        portfolioId: expense.portfolioId,
      });
    }
    await this.audit(userId, id, 'clarify', dto);
    return updated;
  }

  // ─── Защита от дублей (§28) ───────────────────────────────────────────────
  async findPotentialDuplicate(params: {
    portfolioId: string;
    paidByUserId: string;
    amount: number;
    merchant?: string | null;
    date: Date;
  }) {
    const windowStart = new Date(params.date.getTime() - 36 * 3600 * 1000);
    const windowEnd = new Date(params.date.getTime() + 36 * 3600 * 1000);
    return this.prisma.expense.findFirst({
      where: {
        portfolioId: params.portfolioId,
        paidByUserId: params.paidByUserId,
        amount: params.amount,
        date: { gte: windowStart, lte: windowEnd },
        ...(params.merchant ? { merchant: { equals: params.merchant, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async audit(userId: string, entityId: string, action: string, changes?: unknown) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        entity: 'expense',
        entityId,
        action,
        changes: changes ? (changes as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}
