import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';

// Health endpoint is used to verify Vercel runtime env and database connectivity.
function getSafeDatabaseInfo() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;

  try {
    const url = new URL(raw);
    return {
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: url.port || null,
      database: url.pathname ? url.pathname.replace(/^\//, '') : null,
      sslmode: url.searchParams.get('sslmode'),
      isLocalhost: ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname),
    };
  } catch {
    return {
      parseError: true,
    };
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    let database = 'error';
    let databaseErrorCode: string | null = null;
    let databaseErrorName: string | null = null;
    let databaseErrorMessage: string | null = null;
    let schema = 'unknown';
    let userCount: number | null = null;
    let schemaErrorName: string | null = null;
    let schemaErrorMessage: string | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'ok';
    } catch (error) {
      database = 'error';
      databaseErrorName = error instanceof Error ? error.name : 'UnknownError';
      databaseErrorMessage = error instanceof Error ? error.message.split('\n')[0] : null;

      if (typeof error === 'object' && error !== null && 'code' in error) {
        databaseErrorCode = String((error as { code?: unknown }).code);
      }
    }

    if (database === 'ok') {
      try {
        userCount = await this.prisma.user.count();
        schema = 'ok';
      } catch (error) {
        schema = 'error';
        schemaErrorName = error instanceof Error ? error.name : 'UnknownError';
        schemaErrorMessage = error instanceof Error ? error.message.split('\n')[0] : null;
      }
    }

    return {
      service: 'familyfinance-backend',
      app: 'ok',
      database,
      schema,
      userCount,
      databaseErrorName,
      databaseErrorCode,
      databaseErrorMessage,
      schemaErrorName,
      schemaErrorMessage,
      databaseUrl: getSafeDatabaseInfo(),
      env: {
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        hasJwtAccessSecret: Boolean(process.env.JWT_ACCESS_SECRET),
        hasJwtRefreshSecret: Boolean(process.env.JWT_REFRESH_SECRET),
      },
      timestamp: new Date().toISOString(),
    };
  }
}
