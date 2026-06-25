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
      // Выбор провайдера распознавания по AI_PROVIDER.
      // Если AI_PROVIDER не задан, берём первый доступный реальный ключ.
      // Mock включается только явно или если нет ни одного AI-ключа.
      provide: RECEIPT_PARSER,
      useFactory: (openai: OpenAiReceiptParser, claude: ClaudeReceiptParser, mock: MockReceiptParser) => {
        const provider = (process.env.AI_PROVIDER ?? '').toLowerCase();
        if (provider === 'mock') return mock;
        if (provider === 'openai') return process.env.OPENAI_API_KEY ? openai : mock;
        if (provider === 'claude' || provider === 'anthropic') return process.env.ANTHROPIC_API_KEY ? claude : mock;
        if (process.env.OPENAI_API_KEY) return openai;
        if (process.env.ANTHROPIC_API_KEY) return claude;
        return mock;
      },
      inject: [OpenAiReceiptParser, ClaudeReceiptParser, MockReceiptParser],
    },
  ],
  exports: [AiService],
})
export class AiModule {}
