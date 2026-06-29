import { Injectable, Logger } from '@nestjs/common';
import {
  ParseImageInput,
  ParsePdfInput,
  ParseTextInput,
  ParsedOperationType,
  ParsedReceipt,
  ReceiptParser,
} from '../receipt-parser.interface';
import { buildSystemPrompt, parseModelJson } from '../prompt';

@Injectable()
export class OpenAiReceiptParser implements ReceiptParser {
  private readonly logger = new Logger(OpenAiReceiptParser.name);
  private readonly apiUrl = 'https://api.openai.com/v1/responses';
  private readonly model = process.env.AI_MODEL ?? 'gpt-4o-mini';
  private readonly maxOutputTokens = Number(process.env.AI_MAX_TOKENS ?? 2200);

  async parseImage(input: ParseImageInput): Promise<ParsedReceipt> {
    const system = buildSystemPrompt(input.availableCategories, input.previousMerchantCategories);
    const imageMimeType = this.sanitizeImageMimeType(input.mimeType);
    const text = await this.createResponse([
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Распознай финансовую операцию на изображении. Верни строго JSON по системному формату.' },
          { type: 'input_image', image_url: `data:${imageMimeType};base64,${this.cleanBase64(input.imageBase64)}` },
        ],
      },
    ]);
    return this.safeParseSingle(text);
  }

  async parseOperationsImage(input: ParseImageInput): Promise<ParsedReceipt[]> {
    const imageMimeType = this.sanitizeImageMimeType(input.mimeType);
    const text = await this.createResponse([
      {
        role: 'system',
        content: [{ type: 'input_text', text: this.buildOperationsPrompt(input.availableCategories, input.previousMerchantCategories) }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Найди все финансовые операции на изображении. Верни массив operations. Не придумывай суммы, если они не видны.' },
          { type: 'input_image', image_url: `data:${imageMimeType};base64,${this.cleanBase64(input.imageBase64)}` },
        ],
      },
    ]);
    return this.safeParseMany(text);
  }

  async parseText(input: ParseTextInput): Promise<ParsedReceipt> {
    const system = buildSystemPrompt(input.availableCategories, input.previousMerchantCategories);
    const text = await this.createResponse([
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      {
        role: 'user',
        content: [{ type: 'input_text', text: `Сообщение о трате: "${input.text}". Верни строго JSON по системному формату.` }],
      },
    ]);
    const parsed = this.safeParseSingle(text);
    parsed.extractedText = input.text;
    return parsed;
  }

  async parseOperationsText(input: ParseTextInput): Promise<ParsedReceipt[]> {
    const text = await this.createResponse([
      {
        role: 'system',
        content: [{ type: 'input_text', text: this.buildOperationsPrompt(input.availableCategories, input.previousMerchantCategories) }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: `Найди все финансовые операции в тексте и верни массив operations:\n\n${input.text}` }],
      },
    ]);
    return this.safeParseMany(text).map((operation) => ({ ...operation, extractedText: operation.extractedText ?? input.text }));
  }

  async parsePdfStatement(input: ParsePdfInput): Promise<ParsedReceipt[]> {
    const filename = this.sanitizeFilename(input.filename, 'bank-statement.pdf');
    const text = await this.createResponse([
      {
        role: 'system',
        content: [{ type: 'input_text', text: this.buildOperationsPrompt(input.availableCategories, input.previousMerchantCategories) }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_file', filename, file_data: `data:application/pdf;base64,${this.cleanBase64(input.fileBase64)}` },
          { type: 'input_text', text: 'Это PDF-документ: квитанция, справка по операции или банковская выписка. Найди все финансовые операции.' },
        ],
      },
    ]);
    return this.safeParseMany(text);
  }

  async parseOperationsPdf(input: ParsePdfInput): Promise<ParsedReceipt[]> {
    return this.parsePdfStatement(input);
  }

  private buildOperationsPrompt(categories: string[], history?: { merchant: string; category: string }[]) {
    const categoryList = categories.join(', ');
    const historyBlock = history?.length
      ? `\nИстория категорий пользователя:\n${history.map((h) => `- "${h.merchant}" → ${h.category}`).join('\n')}`
      : '';

    return `Ты — модуль импорта финансовых операций для приложения учёта денег.
На вход может прийти фото чека, скрин банковского приложения, PDF-квитанция, справка по операции или банковская выписка.
Найди ВСЕ финансовые операции и верни СТРОГО валидный JSON без markdown.

Доступные категории: ${categoryList}.${historyBlock}

Правила:
- Верни массив operations. Даже если операция одна — верни массив из одного объекта.
- type: "expense" для списаний/покупок/платежей, "income" для поступлений, "transfer" для перевода между своими счетами, "unknown" если непонятно.
- amount — число без пробелов и символа валюты.
- currency — RUB, USD, EUR и т.п.; по умолчанию RUB.
- date — YYYY-MM-DD или null.
- merchant — магазин, банк, получатель, отправитель или контрагент.
- category — строго одно значение из списка категорий; если не уверен — "Другое".
- Если на изображении виден список категорий расходов, создай отдельную операцию по каждой строке с суммой.
- Если непонятно расход это или доход — type="unknown", needs_clarification=true.
- confidence 0..100.

Формат ответа:
{
  "operations": [
    {
      "type": "expense",
      "amount": 14549.27,
      "currency": "RUB",
      "date": "2026-06-25",
      "merchant": "Продукты",
      "description": "Расходы по категории Продукты",
      "category": "Продукты",
      "confidence": 82,
      "needs_clarification": false,
      "clarification_question": null
    }
  ]
}`;
  }

  private async createResponse(input: unknown[]) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY не задан');

    const body = JSON.stringify({ model: this.model, input, max_output_tokens: this.maxOutputTokens });
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message ?? `OpenAI API error ${response.status}`);
    return this.extractOutputText(data);
  }

  private extractOutputText(data: any): string {
    if (typeof data?.output_text === 'string') return data.output_text;
    const pieces: string[] = [];
    for (const item of data?.output ?? []) for (const content of item?.content ?? []) if (typeof content?.text === 'string') pieces.push(content.text);
    return pieces.join('\n');
  }

  private safeParseSingle(text: string): ParsedReceipt {
    try {
      const parsed = parseModelJson(text);
      parsed.extractedText = parsed.extractedText ?? text;
      return parsed;
    } catch (error) {
      this.logger.error(`Не удалось разобрать ответ OpenAI: ${(error as Error).message}`);
      return this.fallback(text);
    }
  }

  private safeParseMany(text: string): ParsedReceipt[] {
    try {
      const jsonStartObj = text.indexOf('{');
      const jsonStartArr = text.indexOf('[');
      const useArray = jsonStartArr >= 0 && (jsonStartObj < 0 || jsonStartArr < jsonStartObj);
      const start = useArray ? jsonStartArr : jsonStartObj;
      const end = useArray ? text.lastIndexOf(']') : text.lastIndexOf('}');
      const slice = start >= 0 && end >= 0 ? text.slice(start, end + 1) : text;
      const data = JSON.parse(slice);
      const operations = Array.isArray(data) ? data : Array.isArray(data.operations) ? data.operations : [];
      return operations.map((operation: any) => this.normalize(operation, text)).filter((operation) => operation.amount != null || operation.description || operation.merchant);
    } catch (error) {
      this.logger.error(`Не удалось разобрать массив операций: ${(error as Error).message}`);
      return [this.fallback(text)];
    }
  }

  private normalize(data: any, raw: string): ParsedReceipt {
    const confidence = this.clamp(data?.confidence);
    const type = this.normalizeType(data?.type);
    return {
      type,
      amount: typeof data?.amount === 'number' ? data.amount : data?.amount ? Number(String(data.amount).replace(/\s/g, '').replace(',', '.')) : null,
      currency: data?.currency ?? 'RUB',
      date: data?.date ?? null,
      merchant: data?.merchant ?? null,
      description: data?.description ?? null,
      category: data?.category ?? null,
      confidence,
      needsClarification: Boolean(data?.needs_clarification) || type === 'unknown' || confidence < 70,
      clarificationQuestion: data?.clarification_question ?? (type === 'unknown' ? 'Это расход, доход, перевод или не учитывать?' : null),
      extractedText: data?.extractedText ?? raw,
    };
  }

  private normalizeType(value: unknown): ParsedOperationType {
    return value === 'income' || value === 'transfer' || value === 'unknown' ? value : 'expense';
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
      clarificationQuestion: 'Не удалось распознать операцию. Попробуйте другой файл или опишите операцию текстом.',
      extractedText: text,
    };
  }

  private sanitizeImageMimeType(value: unknown): string {
    const mime = String(value ?? '').toLowerCase().trim();
    if (mime === 'image/png') return 'image/png';
    if (mime === 'image/webp') return 'image/webp';
    if (mime === 'image/gif') return 'image/gif';
    if (mime === 'image/jpg' || mime === 'image/jpeg') return 'image/jpeg';
    return 'image/jpeg';
  }

  private sanitizeFilename(value: unknown, fallback: string): string {
    const raw = String(value ?? fallback).trim();
    const ext = raw.toLowerCase().endsWith('.pdf') ? '.pdf' : '';
    const base = raw
      .replace(/\.[^.]+$/, '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return `${base || 'document'}${ext || '.pdf'}`;
  }

  private cleanBase64(value: string): string {
    return String(value ?? '')
      .replace(/^data:[^;]+;base64,/i, '')
      .replace(/\s/g, '');
  }

  private clamp(value: unknown) {
    const n = Number(value);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }
}
