import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { RECEIPT_PARSER } from './receipt-parser.interface';
import { ClaudeReceiptParser } from './providers/claude-parser.provider';
import { MockReceiptParser } from './providers/mock-parser.provider';
import { CategorizationModule } from '../categorization/categorization.module';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [CategorizationModule, ExpensesModule],
  controllers: [AiController],
  providers: [
    AiService,
    ClaudeReceiptParser,
    MockReceiptParser,
    {
      // Выбор провайдера распознавания по AI_PROVIDER (claude | mock).
      provide: RECEIPT_PARSER,
      useFactory: (claude: ClaudeReceiptParser, mock: MockReceiptParser) => {
        const provider = (process.env.AI_PROVIDER ?? 'claude').toLowerCase();
        if (provider === 'mock' || !process.env.ANTHROPIC_API_KEY) return mock;
        return claude;
      },
      inject: [ClaudeReceiptParser, MockReceiptParser],
    },
  ],
  exports: [AiService],
})
export class AiModule {}
