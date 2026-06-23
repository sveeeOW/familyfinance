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
    let databaseErrorCode: string | null = null;
    let databaseErrorName: string | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'ok';
    } catch (error) {
      database = 'error';
      databaseErrorName = error instanceof Error ? error.name : 'UnknownError';

      if (typeof error === 'object' && error !== null && 'code' in error) {
        databaseErrorCode = String((error as { code?: unknown }).code);
      }
    }

    return {
      service: 'familyfinance-backend',
      app: 'ok',
      database,
      databaseErrorName,
      databaseErrorCode,
      env: {
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        hasJwtAccessSecret: Boolean(process.env.JWT_ACCESS_SECRET),
        hasJwtRefreshSecret: Boolean(process.env.JWT_REFRESH_SECRET),
      },
      timestamp: new Date().toISOString(),
    };
  }
}
