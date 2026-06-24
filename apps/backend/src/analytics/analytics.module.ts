import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { ForecastService } from './forecast.service';
import { AnalyticsController } from './analytics.controller';
import { InvestmentsModule } from '../investments/investments.module';

@Module({
  imports: [InvestmentsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ForecastService],
  exports: [AnalyticsService, ForecastService],
})
export class AnalyticsModule {}
