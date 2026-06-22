import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessLevel, MemberRole, MemberStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AccessAction = 'view' | 'add' | 'edit' | 'manage';

/**
 * Централизованная проверка доступа к портфелю.
 * Реализует роли (§4) и уровни доступа (§6.3), гарантирует, что пользователь
 * видит только портфели, к которым имеет доступ (§27, §30.8).
 */
@Injectable()
export class PortfolioAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Возвращает membership пользователя в портфеле либо бросает 403/404. */
  async requireMember(portfolioId: string, userId: string) {
    const portfolio = await this.prisma.portfolio.findUnique({ where: { id: portfolioId } });
    if (!portfolio) throw new NotFoundException('Портфель не найден');

    const member = await this.prisma.portfolioMember.findUnique({
      where: { portfolioId_userId: { portfolioId, userId } },
    });
    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException('Нет доступа к этому портфелю');
    }
    return { portfolio, member };
  }

  /** Проверяет право на действие согласно роли и уровню доступа. */
  async require(portfolioId: string, userId: string, action: AccessAction) {
    const { portfolio, member } = await this.requireMember(portfolioId, userId);

    const isOwner = member.role === MemberRole.OWNER;
    const level = member.accessLevel;

    const allowed = (() => {
      switch (action) {
        case 'view':
          return true; // любой активный участник может смотреть в рамках своих прав
        case 'add':
          return isOwner || level === AccessLevel.FULL || level === AccessLevel.LIMITED || level === AccessLevel.PRIVATE;
        case 'edit':
          return isOwner || level === AccessLevel.FULL;
        case 'manage':
          return isOwner; // управление участниками/категориями/правами — владелец
      }
    })();

    if (!allowed) {
      throw new ForbiddenException('Недостаточно прав для этого действия в портфеле');
    }
    return { portfolio, member };
  }

  /** Список id портфелей, доступных пользователю. */
  async accessiblePortfolioIds(userId: string): Promise<string[]> {
    const members = await this.prisma.portfolioMember.findMany({
      where: { userId, status: MemberStatus.ACTIVE },
      select: { portfolioId: true },
    });
    return members.map((m) => m.portfolioId);
  }
}
