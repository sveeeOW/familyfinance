import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreditCardsService } from './credit-cards.service';
import {
  CreateCreditCardChargeDto,
  CreateCreditCardChargeFromAiDto,
  CreateCreditCardDto,
  CreateCreditCardPaymentDto,
  UpdateCreditCardChargeDto,
  UpdateCreditCardDto,
} from './dto';

@ApiTags('credit-cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('credit-cards')
export class CreditCardsController {
  constructor(private readonly creditCards: CreditCardsService) {}

  @Get()
  list(@Query('portfolioId') portfolioId: string, @CurrentUser('userId') userId: string) {
    return this.creditCards.list(portfolioId, userId);
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateCreditCardDto) {
    return this.creditCards.create(userId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser('userId') userId: string, @Body() dto: UpdateCreditCardDto) {
    return this.creditCards.update(id, userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.creditCards.remove(id, userId);
  }

  @Post(':id/charges')
  createCharge(@Param('id') id: string, @CurrentUser('userId') userId: string, @Body() dto: CreateCreditCardChargeDto) {
    return this.creditCards.createCharge(id, userId, dto);
  }

  @Patch('charges/:chargeId')
  updateCharge(@Param('chargeId') chargeId: string, @CurrentUser('userId') userId: string, @Body() dto: UpdateCreditCardChargeDto) {
    return this.creditCards.updateCharge(chargeId, userId, dto);
  }

  @Delete('charges/:chargeId')
  removeCharge(@Param('chargeId') chargeId: string, @CurrentUser('userId') userId: string) {
    return this.creditCards.removeCharge(chargeId, userId);
  }

  @Post(':id/payments')
  addPayment(@Param('id') id: string, @CurrentUser('userId') userId: string, @Body() dto: CreateCreditCardPaymentDto) {
    return this.creditCards.addPayment(id, userId, dto);
  }

  @Post(':id/charges/from-ai')
  createChargeFromAi(@Param('id') id: string, @CurrentUser('userId') userId: string, @Body() dto: CreateCreditCardChargeFromAiDto) {
    return this.creditCards.createChargeFromAi(id, userId, dto.logId);
  }
}
