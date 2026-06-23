import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { RECEIPT_PARSER } from './receipt-parser.interface';
import { ClaudeReceiptParser } from './providers/claude-parser.provider';
import { MockReceiptParser } from './providers/mock-parser.provider';
import { OpenAiReceiptParser } from './providers/openai-parser.provider';
import { CategorizationModule } from '../categorization/categorization.module';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [CategorizationModule, ExpensesModule],
  controllers: [AiController],
  providers: [
    AiService,
    ClaudeReceiptParser,
    MockReceiptParser,
    OpenAiReceiptParser,
    {
      // Выбор провайдера распознавания по AI_PROVIDER (openai | claude | mock).
      provide: RECEIPT_PARSER,
      useFactory: (openai: OpenAiReceiptParser, claude: ClaudeReceiptParser, mock: MockReceiptParser) => {
        const provider = (process.env.AI_PROVIDER ?? 'claude').toLowerCase();
        if (provider === 'openai' && process.env.OPENAI_API_KEY) return openai;
        if (provider === 'mock') return mock;
        if (!process.env.ANTHROPIC_API_KEY) return mock;
        return claude;
      },
      inject: [OpenAiReceiptParser, ClaudeReceiptParser, MockReceiptParser],
    },
  ],
  exports: [AiService],
})
export class AiModule {}
