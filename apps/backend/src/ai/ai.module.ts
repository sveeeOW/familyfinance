import { Module, Logger } from '@nestjs/common';
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
      // Если реальный провайдер выбран явно, но ключ не задан, backend должен упасть с понятной ошибкой,
      // а не возвращать mock-результат как будто распознавание работает.
      provide: RECEIPT_PARSER,
      useFactory: (openai: OpenAiReceiptParser, claude: ClaudeReceiptParser, mock: MockReceiptParser) => {
        const logger = new Logger('AiModule');
        const provider = (process.env.AI_PROVIDER ?? '').toLowerCase();
        const hasOpenAiApiKey = Boolean(process.env.OPENAI_API_KEY);
        const hasAnthropicApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

        if (provider === 'mock') {
          logger.warn('AI_PROVIDER=mock — включён mock-парсер. Реальное распознавание изображений отключено.');
          return mock;
        }

        if (provider === 'openai') {
          if (!hasOpenAiApiKey) {
            throw new Error('AI_PROVIDER=openai, но OPENAI_API_KEY не задан в окружении backend. Добавьте OPENAI_API_KEY в Production Environment Variables проекта familyfinance-application и redeploy без build cache.');
          }
          logger.log(`AI provider selected: openai, model=${process.env.AI_MODEL ?? 'default'}`);
          return openai;
        }

        if (provider === 'claude' || provider === 'anthropic') {
          if (!hasAnthropicApiKey) {
            throw new Error('AI_PROVIDER=claude/anthropic, но ANTHROPIC_API_KEY не задан в окружении backend.');
          }
          logger.log(`AI provider selected: claude, model=${process.env.AI_MODEL ?? 'default'}`);
          return claude;
        }

        if (hasOpenAiApiKey) {
          logger.log(`AI_PROVIDER не задан, выбран OpenAI по наличию OPENAI_API_KEY. model=${process.env.AI_MODEL ?? 'default'}`);
          return openai;
        }

        if (hasAnthropicApiKey) {
          logger.log(`AI_PROVIDER не задан, выбран Claude по наличию ANTHROPIC_API_KEY. model=${process.env.AI_MODEL ?? 'default'}`);
          return claude;
        }

        logger.warn('AI ключи не найдены — включён mock-парсер. Добавьте OPENAI_API_KEY или ANTHROPIC_API_KEY в backend окружение.');
        return mock;
      },
      inject: [OpenAiReceiptParser, ClaudeReceiptParser, MockReceiptParser],
    },
  ],
  exports: [AiService],
})
export class AiModule {}
