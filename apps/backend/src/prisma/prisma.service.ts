import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  /**
   * В serverless-окружении Vercel не подключаемся к БД на старте приложения.
   * Prisma сам откроет соединение при первом реальном запросе к базе.
   * Это позволяет /docs и /health запускаться даже если DATABASE_URL/миграции требуют проверки.
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
