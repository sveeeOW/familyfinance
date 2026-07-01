import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramController } from './telegram.controller';
import { AiModule } from '../ai/ai.module';
import { CreditCardsModule } from '../credit-cards/credit-cards.module';

@Module({
  imports: [AiModule, CreditCardsModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramLinkService],
  exports: [TelegramService, TelegramLinkService],
})
export class TelegramModule {}
