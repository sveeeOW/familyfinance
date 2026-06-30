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
export class GeminiReceiptParser implements ReceiptParser {
  private readonly logger = new Logger(GeminiReceiptParser.name);
  private readonly model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-lite';
  private readonly maxOutputTokens = Number(process.env.AI_MAX_TOKENS ?? 2200);

  async parseImage(input: ParseImageInput): Promise<ParsedReceipt> {
    const system = buildSystemPrompt(input.availableCategories, input.previousMerchantCategories);
    const text = await this.generateContent([
      { text: `${system}\n\nРаспознай финансовую операцию на изображении. Верни строго JSON по системному формату.` },
      { inline_data: { mime_type: this.sanitizeImageMimeType(input.mimeType), data: this.cleanBase64(input.imageBase64) } },
    ]);
    return this.safeParseSingle(text);
  }

  async parseOperationsImage(input: ParseImageInput): Promise<ParsedReceipt[]> {
    const text = await this.generateContent([
      { text: this.buildOperationsPrompt(input.availableCategories, input.previousMerchantCategories) },
      { text: 'Найди все финансовые операции на изображении. Верни массив operations. Не придумывай суммы, если они не видны.' },
      { inline_data: { mime_type: this.sanitizeImageMimeType(input.mimeType), data: this.cleanBase64(input.imageBase64) } },
    ]);
    return this.safeParseMany(text);
  }

  async parseText(input: ParseTextInput): Promise<ParsedReceipt> {
    const system = buildSystemPrompt(input.availableCategories, input.previousMerchantCategories);
    const text = await this.generateContent([
      { text: `${system}\n\nСообщение о трате: "${input.text}". Верни строго JSON по системному формату.` },
    ]);
    const parsed = this.safeParseSingle(text);
    parsed.extractedText = input.text;
    return parsed;
  }

  async parseOperationsText(input: ParseTextInput): Promise<ParsedReceipt[]> {
    const text = await this.generateContent([
      { text: `${this.buildOperationsPrompt(input.availableCategories, input.previousMerchantCategories)}\n\nНайди все финансовые операции в тексте и верни массив operations:\n\n${input.text}` },
    ]);
    return this.safeParseMany(text).map((operation) => ({ ...operation, extractedText: operation.extractedText ?? input.text }));
  }

  async parsePdfStatement(input: ParsePdfInput): Promise<ParsedReceipt[]> {
    const text = await this.generateContent([
      { text: this.buildOperationsPrompt(input.availableCategories, input.previousMerchantCategories) },
      { text: 'Это PDF-документ: квитанция, справка по операции или банковская выписка. Найди все финансовые операции.' },
      { inline_data: { mime_type: 'application/pdf', data: this.cleanBase64(input.fileBase64) } },
    ]);
    return this.safeParseMany(text);
  }

  async parseOperationsPdf(input: ParsePdfInput): Promise<ParsedReceipt[]> {
    return this.parsePdfStatement(input);
  }

  private async generateContent(parts: unknown[]): Promise<string> {
    const apiKey = this.getGeminiApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: this.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message ?? `Gemini API error ${response.status}`);
    return this.extractOutputText(data);
  }

  private extractOutputText(data: any): string {
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    return parts.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).filter(Boolean).join('\n');
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

  private safeParseSingle(text: string): ParsedReceipt {
    try {
      const parsed = parseModelJson(text);
      parsed.extractedText = parsed.extractedText ?? text;
      return parsed;
    } catch (error) {
      this.logger.error(`Не удалось разобрать ответ Gemini: ${(error as Error).message}`);
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
      this.logger.error(`Не удалось разобрать массив операций Gemini: ${(error as Error).message}`);
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

  private getGeminiApiKey(): string {
    const apiKey = String(process.env.GEMINI_API_KEY ?? '').trim();
    if (!apiKey) throw new Error('GEMINI_API_KEY не задан');
    if (!/^[\x20-\x7E]+$/.test(apiKey)) throw new Error('GEMINI_API_KEY содержит недопустимые символы. Проверь переменную окружения в Vercel.');
    return apiKey;
  }

  private sanitizeImageMimeType(value: unknown): string {
    const mime = String(value ?? '').toLowerCase().trim();
    if (mime === 'image/png') return 'image/png';
    if (mime === 'image/webp') return 'image/webp';
    if (mime === 'image/gif') return 'image/gif';
    if (mime === 'image/jpg' || mime === 'image/jpeg') return 'image/jpeg';
    return 'image/jpeg';
  }

  private cleanBase64(value: string): string {
    return String(value ?? '').replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  }

  private clamp(value: unknown) {
    const n = Number(value);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }
}
