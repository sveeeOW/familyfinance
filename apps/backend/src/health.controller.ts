import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
    let errorMessage: string | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'ok';
      userCount = await this.prisma.user.count();
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
      errorMessage,
      env: {
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        hasJwtAccessSecret: Boolean(process.env.JWT_ACCESS_SECRET),
        hasJwtRefreshSecret: Boolean(process.env.JWT_REFRESH_SECRET),
      },
      timestamp: new Date().toISOString(),
    };
  }
}
