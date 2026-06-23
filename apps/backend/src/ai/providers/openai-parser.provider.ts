import { Injectable, Logger } from '@nestjs/common';
import {
  ParseImageInput,
  ParsePdfInput,
  ParseTextInput,
  ParsedReceipt,
  ReceiptParser,
} from '../receipt-parser.interface';
import { buildSystemPrompt, parseModelJson } from '../prompt';

@Injectable()
export class OpenAiReceiptParser implements ReceiptParser {
  private readonly logger = new Logger(OpenAiReceiptParser.name);
  private readonly apiUrl = 'https://api.openai.com/v1/responses';
  private readonly model = process.env.AI_MODEL ?? 'gpt-5.5';
  private readonly maxOutputTokens = Number(process.env.AI_MAX_TOKENS ?? 1800);

  async parseImage(input: ParseImageInput): Promise<ParsedReceipt> {
    const system = buildSystemPrompt(input.availableCategories, input.previousMerchantCategories);
    const text = await this.createResponse([
      {
        role: 'system',
        content: [{ type: 'input_text', text: system }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Распознай финансовую операцию на изображении. Верни строго JSON по системному формату.',
          },
          {
            type: 'input_image',
            image_url: `data:${input.mimeType};base64,${input.imageBase64}`,
          },
        ],
      },
    ]);
    return this.safeParseSingle(text);
  }

  async parseText(input: ParseTextInput): Promise<ParsedReceipt> {
    const system = buildSystemPrompt(input.availableCategories, input.previousMerchantCategories);
    const text = await this.createResponse([
      {
        role: 'system',
        content: [{ type: 'input_text', text: system }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Сообщение о трате: "${input.text}". Верни строго JSON по системному формату.`,
          },
        ],
      },
    ]);
    const parsed = this.safeParseSingle(text);
    parsed.extractedText = input.text;
    return parsed;
  }

  async parsePdfStatement(input: ParsePdfInput): Promise<ParsedReceipt[]> {
    const categories = input.availableCategories.join(', ');
    const prompt = `Ты — модуль разбора банковских выписок для приложения семейных финансов.
Из PDF-выписки извлеки операции списания и покупки. Возвраты, переводы между своими счетами и технические операции не включай, если они не являются расходом.
Верни СТРОГО валидный JSON без markdown и пояснений.

Доступные категории: ${categories}.

Формат ответа:
{
  "operations": [
    {
      "type": "expense",
      "amount": 4850,
      "currency": "RUB",
      "date": "2026-06-22",
      "merchant": "АЗС Газпромнефть",
      "description": "Покупка топлива",
      "category": "Топливо",
      "confidence": 90,
      "needs_clarification": false,
      "clarification_question": null
    }
  ]
}

Правила:
- amount — положительное число без пробелов и валюты.
- date — YYYY-MM-DD, если дата есть.
- category — строго одна из доступных категорий; если не уверен, выбери "Другое".
- confidence — 0..100.
- Если выписка длинная, верни максимум 20 наиболее явных расходов.`;

    const text = await this.createResponse([
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            filename: input.filename || 'bank-statement.pdf',
            file_data: `data:application/pdf;base64,${input.fileBase64}`,
          },
          {
            type: 'input_text',
            text: prompt,
          },
        ],
      },
    ]);

    return this.safeParseMany(text);
  }

  private async createResponse(input: unknown[]) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY не задан');

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input,
        max_output_tokens: this.maxOutputTokens,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data?.error?.message ?? `OpenAI API error ${response.status}`;
      throw new Error(message);
    }

    return this.extractOutputText(data);
  }

  private extractOutputText(data: any): string {
    if (typeof data?.output_text === 'string') return data.output_text;

    const pieces: string[] = [];
    for (const item of data?.output ?? []) {
      for (const content of item?.content ?? []) {
        if (typeof content?.text === 'string') pieces.push(content.text);
      }
    }
    return pieces.join('\n');
  }

  private safeParseSingle(text: string): ParsedReceipt {
    try {
      return parseModelJson(text);
    } catch (error) {
      this.logger.error(`Не удалось разобрать ответ OpenAI: ${(error as Error).message}`);
      return this.fallback(text);
    }
  }

  private safeParseMany(text: string): ParsedReceipt[] {
    try {
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      const slice = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
      const data = JSON.parse(slice);
      const operations = Array.isArray(data.operations) ? data.operations : [];
      return operations.map((operation: any) => this.normalize(operation)).filter((operation) => operation.amount);
    } catch (error) {
      this.logger.error(`Не удалось разобрать PDF-выписку: ${(error as Error).message}`);
      return [];
    }
  }

  private normalize(data: any): ParsedReceipt {
    const confidence = this.clamp(data.confidence);
    return {
      type: data.type === 'income' ? 'income' : 'expense',
      amount: typeof data.amount === 'number' ? data.amount : data.amount ? Number(String(data.amount).replace(/\s/g, '').replace(',', '.')) : null,
      currency: data.currency ?? 'RUB',
      date: data.date ?? null,
      merchant: data.merchant ?? null,
      description: data.description ?? null,
      category: data.category ?? null,
      confidence,
      needsClarification: Boolean(data.needs_clarification) || confidence < 70,
      clarificationQuestion: data.clarification_question ?? null,
      extractedText: data.description ?? data.merchant ?? null,
    };
  }

  private fallback(text: string): ParsedReceipt {
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

  private clamp(value: unknown) {
    const n = Number(value);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }
}
