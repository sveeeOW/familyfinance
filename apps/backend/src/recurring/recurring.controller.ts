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
import { RecurringService } from './recurring.service';
import { CreateRecurringDto, UpdateRecurringDto } from './dto/recurring.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('recurring-payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recurring-payments')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  list(@Query('portfolioId') portfolioId: string, @CurrentUser('userId') userId: string) {
    return this.recurring.list(portfolioId, userId);
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateRecurringDto) {
    return this.recurring.create(userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateRecurringDto,
  ) {
    return this.recurring.update(id, userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.recurring.remove(id, userId);
  }
}
