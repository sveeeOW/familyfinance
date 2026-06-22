import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  ParseImageInput,
  ParseTextInput,
  ParsedReceipt,
  ReceiptParser,
} from '../receipt-parser.interface';
import { buildSystemPrompt, parseModelJson } from '../prompt';

/**
 * Распознавание чека одним вызовом мультимодальной модели Claude (§11, §21).
 * Заменяет связку «OCR → отдельный AI-категоризатор»: модель сразу возвращает
 * структурированный JSON с суммой, продавцом, категорией и confidence.
 */
@Injectable()
export class ClaudeReceiptParser implements ReceiptParser {
  private readonly logger = new Logger(ClaudeReceiptParser.name);
  private readonly client: Anthropic;
  private readonly model = process.env.AI_MODEL ?? 'claude-sonnet-4-6';
  private readonly maxTokens = Number(process.env.AI_MAX_TOKENS ?? 1024);

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async parseImage(input: ParseImageInput): Promise<ParsedReceipt> {
    const system = buildSystemPrompt(input.availableCategories, input.previousMerchantCategories);
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: input.mimeType as any,
                data: input.imageBase64,
              },
            },
            {
              type: 'text',
              text: 'Распознай операцию на изображении и верни JSON по заданному формату.',
            },
          ],
        },
      ],
    });

    const text = this.extractText(message);
    return this.safeParse(text);
  }

  async parseText(input: ParseTextInput): Promise<ParsedReceipt> {
    const system = buildSystemPrompt(input.availableCategories, input.previousMerchantCategories);
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      messages: [
        {
          role: 'user',
          content: `Сообщение о трате: "${input.text}". Верни JSON по заданному формату.`,
        },
      ],
    });

    const text = this.extractText(message);
    const parsed = this.safeParse(text);
    parsed.extractedText = input.text;
    return parsed;
  }

  private extractText(message: Anthropic.Message): string {
    const block = message.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  }

  private safeParse(text: string): ParsedReceipt {
    try {
      const parsed = parseModelJson(text);
      parsed.extractedText = parsed.extractedText ?? text;
      return parsed;
    } catch (e) {
      this.logger.error(`Не удалось разобрать ответ модели: ${(e as Error).message}`);
      return {
        type: 'expense',
        amount: null,
        currency: 'RUB',
        date: null,
        merchant: null,
        description: 'Ошибка распознавания',
        category: null,
        confidence: 0,
        needsClarification: true,
        clarificationQuestion: 'Не удалось распознать операцию. Опишите трату текстом, пожалуйста.',
        extractedText: text,
      };
    }
  }
}
