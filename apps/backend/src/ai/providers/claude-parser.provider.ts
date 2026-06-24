import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  ParseImageInput,
  ParsePdfInput,
  ParseTextInput,
  ParsedOperationType,
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
  private readonly maxTokens = Number(process.env.AI_MAX_TOKENS ?? 2048);

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

  async parseOperationsImage(input: ParseImageInput): Promise<ParsedReceipt[]> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: Math.max(this.maxTokens, 2500),
      system: this.buildOperationsPrompt(input.availableCategories, input.previousMerchantCategories),
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
              text: 'Найди все финансовые операции на изображении. Это может быть чек, перевод, банковская история, список категорий или выписка. Верни массив операций.',
            },
          ],
        },
      ],
    });
    return this.safeParseOperations(this.extractText(message));
  }

  async parseOperationsText(input: ParseTextInput): Promise<ParsedReceipt[]> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: Math.max(this.maxTokens, 2500),
      system: this.buildOperationsPrompt(input.availableCategories, input.previousMerchantCategories),
      messages: [
        {
          role: 'user',
          content: `Найди все финансовые операции в тексте и верни массив операций:\n\n${input.text}`,
        },
      ],
    });
    const operations = this.safeParseOperations(this.extractText(message));
    return operations.map((operation) => ({ ...operation, extractedText: operation.extractedText ?? input.text }));
  }

  async parseOperationsPdf(input: ParsePdfInput): Promise<ParsedReceipt[]> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: Math.max(this.maxTokens, 3000),
      system: this.buildOperationsPrompt(input.availableCategories, input.previousMerchantCategories),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: input.fileBase64,
              },
            } as any,
            {
              type: 'text',
              text: `Это PDF-документ ${input.filename}: квитанция, справка по операции или банковская выписка. Найди все финансовые операции и верни массив операций.`,
            },
          ],
        },
      ],
    });
    return this.safeParseOperations(this.extractText(message));
  }

  private buildOperationsPrompt(categories: string[], history?: { merchant: string; category: string }[]) {
    const categoryList = categories.join(', ');
    const historyBlock = history?.length
      ? `\nИстория категорий пользователя:\n${history.map((h) => `- "${h.merchant}" → ${h.category}`).join('\n')}`
      : '';

    return `Ты — модуль импорта финансовых операций для семейного приложения учёта денег.
На вход может прийти фото чека, скрин банковского приложения, PDF-квитанция, справка по операции или банковская выписка.
Твоя задача — найти ВСЕ финансовые операции и вернуть СТРОГО валидный JSON без markdown.

Доступные категории: ${categoryList}.${historyBlock}

Правила:
- Верни не одну операцию, а массив operations.
- Если видишь одну операцию — всё равно верни массив из одного объекта.
- type: "expense" для списаний/покупок/платежей, "income" для поступлений, "transfer" для перевода между своими счетами или близким человеком, "unknown" если непонятно.
- amount — число без пробелов и символа валюты.
- currency — RUB, USD, EUR и т.п.; по умолчанию RUB.
- date — YYYY-MM-DD или null.
- merchant — магазин, банк, получатель, отправитель или контрагент.
- category — строго одно значение из списка категорий; если не уверен — "Другое".
- Для переводов самому себе или между своими счетами ставь type="transfer" и category="Другое".
- Если непонятно расход это или доход — type="unknown", needs_clarification=true и вопрос в clarification_question.
- confidence 0..100.

Формат ответа:
{
  "operations": [
    {
      "type": "expense",
      "amount": 22627,
      "currency": "RUB",
      "date": "2026-06-23",
      "merchant": "Сбербанк / Евгений Андреевич К.",
      "description": "Перевод через СБП",
      "category": "Другое",
      "confidence": 82,
      "needs_clarification": true,
      "clarification_question": "Это расход, перевод между своими счетами или не учитывать?"
    }
  ]
}`;
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
      return this.fallback(text);
    }
  }

  private safeParseOperations(text: string): ParsedReceipt[] {
    try {
      const jsonStartObj = text.indexOf('{');
      const jsonStartArr = text.indexOf('[');
      const useArray = jsonStartArr >= 0 && (jsonStartObj < 0 || jsonStartArr < jsonStartObj);
      const start = useArray ? jsonStartArr : jsonStartObj;
      const end = useArray ? text.lastIndexOf(']') : text.lastIndexOf('}');
      const slice = start >= 0 && end >= 0 ? text.slice(start, end + 1) : text;
      const data = JSON.parse(slice);
      const rawOperations = Array.isArray(data) ? data : Array.isArray(data.operations) ? data.operations : [];
      return rawOperations.map((item) => this.normalizeOperation(item, text)).filter((item) => item.amount != null || item.description || item.merchant);
    } catch (e) {
      this.logger.error(`Не удалось разобрать массив операций: ${(e as Error).message}`);
      return [this.fallback(text)];
    }
  }

  private normalizeOperation(data: any, raw: string): ParsedReceipt {
    const confidence = this.clampConfidence(data?.confidence);
    const operationType = this.normalizeType(data?.type);
    return {
      type: operationType,
      amount: typeof data?.amount === 'number' ? data.amount : data?.amount ? Number(String(data.amount).replace(',', '.')) : null,
      currency: data?.currency ?? 'RUB',
      date: data?.date ?? null,
      merchant: data?.merchant ?? null,
      description: data?.description ?? null,
      category: data?.category ?? null,
      confidence,
      needsClarification: Boolean(data?.needs_clarification) || operationType === 'unknown' || confidence < 70,
      clarificationQuestion: data?.clarification_question ?? (operationType === 'unknown' ? 'Это расход, доход, перевод или не учитывать?' : null),
      extractedText: data?.extractedText ?? raw,
    };
  }

  private normalizeType(value: unknown): ParsedOperationType {
    return value === 'income' || value === 'transfer' || value === 'unknown' ? value : 'expense';
  }

  private clampConfidence(value: unknown): number {
    const n = Number(value);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private fallback(text: string): ParsedReceipt {
    return {
      type: 'unknown',
      amount: null,
      currency: 'RUB',
      date: null,
      merchant: null,
      description: 'Ошибка распознавания',
      category: null,
      confidence: 0,
      needsClarification: true,
      clarificationQuestion: 'Не удалось распознать операции. Попробуйте другой файл или добавьте вручную.',
      extractedText: text,
    };
  }
}
