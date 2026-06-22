import { Injectable, NotFoundException } from '@nestjs/common';
import { DividendStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';
import {
  CreateDividendDto,
  CreateInvestmentDto,
  UpdateDividendDto,
  UpdateInvestmentDto,
} from './dto/investment.dto';

@Injectable()
export class InvestmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
  ) {}

  // ─── Investments ──────────────────────────────────────────────────────────
  async create(userId: string, dto: CreateInvestmentDto) {
    await this.access.require(dto.portfolioId, userId, 'add');
    return this.prisma.investment.create({
      data: {
        portfolioId: dto.portfolioId,
        userId,
        assetName: dto.assetName,
        assetType: dto.assetType,
        quantity: dto.quantity,
        averageBuyPrice: dto.averageBuyPrice,
        currentPrice: dto.currentPrice,
        currency: dto.currency ?? 'RUB',
        expectedDividends: dto.expectedDividends,
        comment: dto.comment,
      },
    });
  }

  async list(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const items = await this.prisma.investment.findMany({
      where: { portfolioId },
      include: { dividends: true },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((i) => {
      const qty = Number(i.quantity);
      const value = i.currentPrice ? qty * Number(i.currentPrice) : qty * Number(i.averageBuyPrice);
      const cost = qty * Number(i.averageBuyPrice);
      return { ...i, marketValue: Math.round(value), profit: Math.round(value - cost) };
    });
  }

  async update(id: string, userId: string, dto: UpdateInvestmentDto) {
    const inv = await this.prisma.investment.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Актив не найден');
    await this.access.require(inv.portfolioId, userId, 'edit');
    return this.prisma.investment.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string) {
    const inv = await this.prisma.investment.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Актив не найден');
    await this.access.require(inv.portfolioId, userId, 'edit');
    await this.prisma.investment.delete({ where: { id } });
    return { success: true };
  }

  // ─── Dividends (§13.2) ────────────────────────────────────────────────────
  async createDividend(userId: string, dto: CreateDividendDto) {
    await this.access.require(dto.portfolioId, userId, 'add');
    return this.prisma.dividend.create({
      data: {
        portfolioId: dto.portfolioId,
        investmentId: dto.investmentId,
        userId,
        amount: dto.amount,
        currency: dto.currency ?? 'RUB',
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        status: dto.status ?? DividendStatus.EXPECTED,
      },
    });
  }

  async updateDividend(id: string, userId: string, dto: UpdateDividendDto) {
    const div = await this.prisma.dividend.findUnique({ where: { id } });
    if (!div) throw new NotFoundException('Дивиденд не найден');
    await this.access.require(div.portfolioId, userId, 'edit');
    return this.prisma.dividend.update({
      where: { id },
      data: {
        status: dto.status,
        receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : undefined,
      },
    });
  }

  /** Прогноз инвестиционного дохода (§13.3). */
  async forecast(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    const [investments, dividends] = await Promise.all([
      this.prisma.investment.findMany({ where: { portfolioId } }),
      this.prisma.dividend.findMany({ where: { portfolioId } }),
    ]);

    const portfolioValue = investments.reduce((s, i) => {
      const qty = Number(i.quantity);
      const price = i.currentPrice ? Number(i.currentPrice) : Number(i.averageBuyPrice);
      return s + qty * price;
    }, 0);

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const expectedThisYear = dividends
      .filter((d) => d.status === DividendStatus.EXPECTED && (!d.expectedDate || d.expectedDate >= now))
      .reduce((s, d) => s + Number(d.amount), 0);
    const receivedThisYear = dividends
      .filter((d) => d.status === DividendStatus.RECEIVED && d.receivedDate && d.receivedDate >= yearStart)
      .reduce((s, d) => s + Number(d.amount), 0);
    const expectedThisMonth = dividends
      .filter(
        (d) =>
          d.status === DividendStatus.EXPECTED &&
          d.expectedDate &&
          d.expectedDate.getFullYear() === now.getFullYear() &&
          d.expectedDate.getMonth() === now.getMonth(),
      )
      .reduce((s, d) => s + Number(d.amount), 0);

    return {
      portfolioValue: Math.round(portfolioValue),
      expectedDividendsThisMonth: Math.round(expectedThisMonth),
      expectedDividendsThisYear: Math.round(expectedThisYear),
      receivedDividendsThisYear: Math.round(receivedThisYear),
    };
  }
}
