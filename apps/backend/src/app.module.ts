import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AccessModule } from './common/access/access.module';
import { MailerModule } from './mailer/mailer.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PortfoliosModule } from './portfolios/portfolios.module';
import { CategoriesModule } from './categories/categories.module';
import { IncomesModule } from './incomes/incomes.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CreditsModule } from './credits/credits.module';
import { RecurringModule } from './recurring/recurring.module';
import { InvestmentsModule } from './investments/investments.module';
import { BudgetsModule } from './budgets/budgets.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AiModule } from './ai/ai.module';
import { TelegramModule } from './telegram/telegram.module';
import { NotificationsModule } from './notifications/notifications.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AccessModule,
    MailerModule,
    StorageModule,
    AuthModule,
    UsersModule,
    PortfoliosModule,
    CategoriesModule,
    IncomesModule,
    ExpensesModule,
    CreditsModule,
    RecurringModule,
    InvestmentsModule,
    BudgetsModule,
    AnalyticsModule,
    AiModule,
    TelegramModule,
    NotificationsModule,
    QueueModule,
  ],
})
export class AppModule {}
