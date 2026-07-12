import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { BalanceEngineService } from './balance-engine.service';
import { ForecastService } from './forecast.service';
import { InvestmentsService } from '../investments/investments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly balanceEngine: BalanceEngineService,
    private readonly forecastService: ForecastService,
    private readonly investments: InvestmentsService,
  ) {}

  @Get('summary')
  async summary(@Query('portfolioId') portfolioId: string, @CurrentUser('userId') userId: string) {
    const [summary, balance] = await Promise.all([
      this.analytics.summary(portfolioId, userId),
      this.balanceEngine.current(portfolioId, userId),
    ]);
    return {
      ...summary,
      currentBalance: balance.currentBalance,
      availableNow: balance.currentBalance,
      freeMoney: balance.currentBalance,
      openingBalance: balance.openingBalance,
      confirmedIncome: balance.confirmedIncome,
      confirmedExpense: balance.confirmedExpense,
    };
  }

  @Get('balance-audit')
  balanceAudit(
    @Query('portfolioId') portfolioId: string,
    @Query('actualBalance') actualBalance: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    const parsed = actualBalance == null || actualBalance === '' ? undefined : Number(actualBalance);
    return this.balanceEngine.audit(portfolioId, userId, {
      actualBalance: Number.isFinite(parsed) ? parsed : undefined,
    });
  }

  @Get('monthly')
  monthly(
    @Query('portfolioId') portfolioId: string,
    @Query('months') months: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.analytics.monthly(portfolioId, userId, months ? Number(months) : 6);
  }

  @Get('categories')
  categories(@Query('portfolioId') portfolioId: string, @CurrentUser('userId') userId: string) {
    return this.analytics.categories(portfolioId, userId);
  }

  @Get('forecast')
  forecast(@Query('portfolioId') portfolioId: string, @CurrentUser('userId') userId: string) {
    return this.forecastService.forecast(portfolioId, userId);
  }

  @Get('credits')
  credits(@Query('portfolioId') portfolioId: string, @CurrentUser('userId') userId: string) {
    return this.analytics.creditsAnalytics(portfolioId, userId);
  }

  @Get('investments')
  investmentsAnalytics(
    @Query('portfolioId') portfolioId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.investments.forecast(portfolioId, userId);
  }
}
