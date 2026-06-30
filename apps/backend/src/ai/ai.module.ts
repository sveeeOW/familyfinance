import { Module, Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { RECEIPT_PARSER } from './receipt-parser.interface';
import { ClaudeReceiptParser } from './providers/claude-parser.provider';
import { GeminiReceiptParser } from './providers/gemini-parser.provider';
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
    GeminiReceiptParser,
    MockReceiptParser,
    OpenAiReceiptParser,
    {
      // Выбор провайдера распознавания по AI_PROVIDER.
      // Ошибка в AI-настройках не должна убивать весь backend и ломать login.
      provide: RECEIPT_PARSER,
      useFactory: (openai: OpenAiReceiptParser, claude: ClaudeReceiptParser, gemini: GeminiReceiptParser, mock: MockReceiptParser) => {
        const logger = new Logger('AiModule');
        const provider = (process.env.AI_PROVIDER ?? '').toLowerCase();
        const hasOpenAiApiKey = Boolean(process.env.OPENAI_API_KEY);
        const hasAnthropicApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
        const hasGeminiApiKey = Boolean(process.env.GEMINI_API_KEY);

        const fallback = (reason: string) => {
          if (hasGeminiApiKey) {
            logger.warn(`${reason} Выбран Gemini по наличию GEMINI_API_KEY. model=${process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-lite'}`);
            return gemini;
          }
          if (hasOpenAiApiKey) {
            logger.warn(`${reason} Выбран OpenAI по наличию OPENAI_API_KEY. model=${process.env.AI_MODEL ?? 'default'}`);
            return openai;
          }
          if (hasAnthropicApiKey) {
            logger.warn(`${reason} Выбран Claude по наличию ANTHROPIC_API_KEY. model=${process.env.AI_MODEL ?? 'default'}`);
            return claude;
          }
          logger.warn(`${reason} AI ключи не найдены — включён mock-парсер. Авторизация и приложение продолжат работать.`);
          return mock;
        };

        if (provider === 'mock') {
          logger.warn('AI_PROVIDER=mock — включён mock-парсер. Реальное распознавание изображений отключено.');
          return mock;
        }

        if (provider === 'gemini' || provider === 'google') {
          if (!hasGeminiApiKey) return fallback('AI_PROVIDER=gemini, но GEMINI_API_KEY не задан.');
          logger.log(`AI provider selected: gemini, model=${process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-lite'}`);
          return gemini;
        }

        if (provider === 'openai') {
          if (!hasOpenAiApiKey) return fallback('AI_PROVIDER=openai, но OPENAI_API_KEY не задан.');
          logger.log(`AI provider selected: openai, model=${process.env.AI_MODEL ?? 'default'}`);
          return openai;
        }

        if (provider === 'claude' || provider === 'anthropic') {
          if (!hasAnthropicApiKey) return fallback('AI_PROVIDER=claude/anthropic, но ANTHROPIC_API_KEY не задан.');
          logger.log(`AI provider selected: claude, model=${process.env.AI_MODEL ?? 'default'}`);
          return claude;
        }

        return fallback('AI_PROVIDER не задан или неизвестен.');
      },
      inject: [OpenAiReceiptParser, ClaudeReceiptParser, GeminiReceiptParser, MockReceiptParser],
    },
  ],
  exports: [AiService],
})
export class AiModule {}
