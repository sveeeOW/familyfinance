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
import { ExpenseStatus } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import {
  ClarifyExpenseDto,
  CreateExpenseDto,
  UpdateExpenseDto,
} from './dto/expense.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(
    @CurrentUser('userId') userId: string,
    @Query('portfolioId') portfolioId: string,
    @Query('categoryId') categoryId?: string,
    @Query('memberId') memberId?: string,
    @Query('status') status?: ExpenseStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    return this.expenses.list(userId, {
      portfolioId,
      categoryId,
      userId: memberId,
      status,
      from,
      to,
      search,
    });
  }

  @Get('needs-clarification')
  needsClarification(
    @Query('portfolioId') portfolioId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.expenses.needsClarification(portfolioId, userId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.expenses.get(id, userId);
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenses.update(id, userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.expenses.remove(id, userId);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.expenses.confirm(id, userId);
  }

  @Post(':id/clarify')
  clarify(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: ClarifyExpenseDto,
  ) {
    return this.expenses.clarify(id, userId, dto);
  }
}
