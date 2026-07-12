import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { BalanceEngineService } from './balance-engine.service';
import { ForecastService } from './forecast.service';
import { AnalyticsController } from './analytics.controller';
import { InvestmentsModule } from '../investments/investments.module';

@Module({
  imports: [InvestmentsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, BalanceEngineService, ForecastService],
  exports: [AnalyticsService, BalanceEngineService, ForecastService],
})
export class AnalyticsModule {}
