import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PortfolioType } from '@prisma/client';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    let database = 'error';
    let schema = 'unknown';
    let userCount: number | null = null;
    let repairedPortfolios = 0;
    let errorMessage: string | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.repairSharedPortfoliosMarkedAsPersonal();
      database = 'ok';
      userCount = await this.prisma.user.count();
      repairedPortfolios = await this.countSharedPortfoliosThatAreNoLongerPersonal();
      schema = 'ok';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message.split('\n')[0] : 'Unknown error';
    }

    return {
      service: 'familyfinance-backend',
      app: 'ok',
      database,
      schema,
      userCount,
      repairedPortfolios,
      errorMessage,
      env: {
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        hasJwtAccessSecret: Boolean(process.env.JWT_ACCESS_SECRET),
        hasJwtRefreshSecret: Boolean(process.env.JWT_REFRESH_SECRET),
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async repairSharedPortfoliosMarkedAsPersonal() {
    const candidates = await this.prisma.portfolio.findMany({
      where: { type: PortfolioType.PERSONAL },
      include: { _count: { select: { members: true } } },
      take: 50,
    });
    const shared = candidates.filter((portfolio) => portfolio._count.members > 1);
    for (const portfolio of shared) {
      await this.prisma.portfolio.update({ where: { id: portfolio.id }, data: { type: PortfolioType.SHARED } });
    }
  }

  private async countSharedPortfoliosThatAreNoLongerPersonal() {
    return this.prisma.portfolio.count({ where: { type: PortfolioType.SHARED, members: { some: {} } } });
  }
}
