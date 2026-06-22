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
import { IncomesService } from './incomes.service';
import { CreateIncomeDto, UpdateIncomeDto } from './dto/income.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('incomes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('incomes')
export class IncomesController {
  constructor(private readonly incomes: IncomesService) {}

  @Get()
  list(@Query('portfolioId') portfolioId: string, @CurrentUser('userId') userId: string) {
    return this.incomes.list(portfolioId, userId);
  }

  @Get('forecast')
  forecast(
    @Query('portfolioId') portfolioId: string,
    @Query('months') months: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.incomes.forecast(portfolioId, userId, months ? Number(months) : 6);
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateIncomeDto) {
    return this.incomes.create(userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateIncomeDto,
  ) {
    return this.incomes.update(id, userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.incomes.remove(id, userId);
  }
}
