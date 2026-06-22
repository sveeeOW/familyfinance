import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InvestmentsService } from './investments.service';
import {
  CreateDividendDto,
  CreateInvestmentDto,
  UpdateDividendDto,
  UpdateInvestmentDto,
} from './dto/investment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('investments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class InvestmentsController {
  constructor(private readonly investments: InvestmentsService) {}

  @Get('investments')
  list(@Query('portfolioId') portfolioId: string, @CurrentUser('userId') userId: string) {
    return this.investments.list(portfolioId, userId);
  }

  @Get('investments/forecast')
  forecast(@Query('portfolioId') portfolioId: string, @CurrentUser('userId') userId: string) {
    return this.investments.forecast(portfolioId, userId);
  }

  @Post('investments')
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateInvestmentDto) {
    return this.investments.create(userId, dto);
  }

  @Patch('investments/:id')
  update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateInvestmentDto,
  ) {
    return this.investments.update(id, userId, dto);
  }

  @Delete('investments/:id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.investments.remove(id, userId);
  }

  // ─── Dividends ────────────────────────────────────────────────────────────
  @Post('dividends')
  createDividend(@CurrentUser('userId') userId: string, @Body() dto: CreateDividendDto) {
    return this.investments.createDividend(userId, dto);
  }

  @Patch('dividends/:id')
  updateDividend(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateDividendDto,
  ) {
    return this.investments.updateDividend(id, userId, dto);
  }
}
