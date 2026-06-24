import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberRole, MemberStatus } from '@prisma/client';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';
import { CategoriesService } from '../categories/categories.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateInviteDto,
  CreatePortfolioDto,
  UpdateMemberDto,
  UpdatePortfolioDto,
} from './dto/portfolio.dto';

@Injectable()
export class PortfoliosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
    private readonly categories: CategoriesService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreatePortfolioDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const portfolio = await this.prisma.portfolio.create({
      data: {
        name: dto.name,
        type: dto.type,
        currency: dto.currency ?? user?.defaultCurrency ?? 'RUB',
        description: dto.description,
        ownerUserId: userId,
        members: {
          create: { userId, role: MemberRole.OWNER, accessLevel: 'FULL', status: 'ACTIVE' },
        },
      },
    });
    await this.categories.ensurePortfolioCategories(portfolio.id);
    return portfolio;
  }

  async list(userId: string) {
    return this.prisma.portfolio.findMany({
      where: { members: { some: { userId, status: MemberStatus.ACTIVE } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        _count: { select: { expenses: true, incomes: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async get(id: string, userId: string) {
    await this.access.requireMember(id, userId);
    return this.prisma.portfolio.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
    });
  }

  async update(id: string, userId: string, dto: UpdatePortfolioDto) {
    await this.access.require(id, userId, 'manage');
    return this.prisma.portfolio.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string) {
    const { member, portfolio } = await this.access.requireMember(id, userId);
    if (member.role !== MemberRole.OWNER) throw new ForbiddenException('Удалить портфель может только владелец');
    if (portfolio.isDefault) throw new BadRequestException('Нельзя удалить личный портфель по умолчанию');
    await this.prisma.portfolio.delete({ where: { id } });
    return { success: true };
  }

  async listMembers(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    return this.prisma.portfolioMember.findMany({
      where: { portfolioId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async updateMember(portfolioId: string, memberId: string, userId: string, dto: UpdateMemberDto) {
    await this.access.require(portfolioId, userId, 'manage');
    const member = await this.prisma.portfolioMember.findUnique({ where: { id: memberId } });
    if (!member || member.portfolioId !== portfolioId) throw new NotFoundException('Участник не найден');
    if (member.role === MemberRole.OWNER) throw new BadRequestException('Роль владельца изменить нельзя');
    return this.prisma.portfolioMember.update({ where: { id: memberId }, data: dto });
  }

  async removeMember(portfolioId: string, memberId: string, userId: string) {
    await this.access.require(portfolioId, userId, 'manage');
    const member = await this.prisma.portfolioMember.findUnique({ where: { id: memberId } });
    if (!member || member.portfolioId !== portfolioId) throw new NotFoundException('Участник не найден');
    if (member.role === MemberRole.OWNER) throw new BadRequestException('Владельца нельзя удалить из портфеля');
    await this.prisma.portfolioMember.delete({ where: { id: memberId } });
    return { success: true };
  }

  async createInvite(portfolioId: string, userId: string, dto: CreateInviteDto) {
    await this.access.require(portfolioId, userId, 'manage');
    const token = nanoid(24);
    const invite = await this.prisma.inviteLink.create({
      data: {
        portfolioId,
        createdByUserId: userId,
        token,
        role: dto.role ?? MemberRole.MEMBER,
        accessLevel: dto.accessLevel ?? 'FULL',
        maxUses: dto.maxUses ?? 1,
        expiresAt: new Date(Date.now() + (dto.expiresInHours ?? 168) * 3600 * 1000),
      },
    });
    const base = (process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    return { ...invite, url: `${base}/invite/${token}` };
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.prisma.inviteLink.findUnique({ where: { token } });
    if (!invite || invite.status !== 'ACTIVE') throw new NotFoundException('Приглашение не найдено или отозвано');
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      await this.prisma.inviteLink.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('Срок действия приглашения истёк');
    }
    if (invite.usedCount >= invite.maxUses) throw new BadRequestException('Приглашение уже использовано');

    const existing = await this.prisma.portfolioMember.findUnique({
      where: { portfolioId_userId: { portfolioId: invite.portfolioId, userId } },
    });
    if (existing && existing.status === MemberStatus.ACTIVE) {
      return { success: true, alreadyMember: true, portfolioId: invite.portfolioId };
    }

    await this.prisma.$transaction([
      this.prisma.portfolioMember.upsert({
        where: { portfolioId_userId: { portfolioId: invite.portfolioId, userId } },
        create: { portfolioId: invite.portfolioId, userId, role: invite.role, accessLevel: invite.accessLevel, status: MemberStatus.ACTIVE },
        update: { status: MemberStatus.ACTIVE, role: invite.role, accessLevel: invite.accessLevel },
      }),
      this.prisma.inviteLink.update({
        where: { id: invite.id },
        data: { usedCount: { increment: 1 }, status: invite.usedCount + 1 >= invite.maxUses ? 'EXPIRED' : 'ACTIVE' },
      }),
    ]);

    try {
      const [portfolio, joined] = await Promise.all([
        this.prisma.portfolio.findUnique({ where: { id: invite.portfolioId } }),
        this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      ]);
      if (portfolio && portfolio.ownerUserId !== userId) {
        await this.notifications.notifyUser(
          portfolio.ownerUserId,
          'Новый участник',
          `${joined?.name ?? 'Пользователь'} присоединился к портфелю «${portfolio.name}».`,
          { type: 'member_joined', portfolioId: portfolio.id },
        );
      }
    } catch {
      /* уведомление не должно ломать приём приглашения */
    }

    return { success: true, portfolioId: invite.portfolioId };
  }
}
