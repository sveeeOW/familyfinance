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
import { CreditsService } from './credits.service';
import { CreateCreditDto, UpdateCreditDto } from './dto/credit.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('credits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('credits')
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  @Get()
  list(@Query('portfolioId') portfolioId: string, @CurrentUser('userId') userId: string) {
    return this.credits.list(portfolioId, userId);
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateCreditDto) {
    return this.credits.create(userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateCreditDto,
  ) {
    return this.credits.update(id, userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.credits.remove(id, userId);
  }
}
