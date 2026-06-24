import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
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
    private readonly forecastService: ForecastService,
    private readonly investments: InvestmentsService,
  ) {}

  @Get('summary')
  summary(@Query('portfolioId') portfolioId: string, @CurrentUser('userId') userId: string) {
    return this.analytics.summary(portfolioId, userId);
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
