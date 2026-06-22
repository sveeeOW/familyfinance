import { ParsedReceipt } from './receipt-parser.interface';

export function buildSystemPrompt(categories: string[], history?: { merchant: string; category: string }[]): string {
  const categoryList = categories.join(', ');
  const historyBlock =
    history && history.length
      ? `\nИстория категорий пользователя (учитывай при выборе):\n${history
          .map((h) => `- "${h.merchant}" → ${h.category}`)
          .join('\n')}`
      : '';

  return `Ты — модуль распознавания финансовых операций для приложения учёта семейных финансов.
На вход приходит скриншот банковского уведомления, чек или текстовое описание траты на русском языке.
Твоя задача — извлечь данные операции и вернуть СТРОГО валидный JSON без markdown и пояснений.

Доступные категории: ${categoryList}.${historyBlock}

Правила:
- "amount" — число без пробелов и символа валюты (например 4850).
- "currency" — ISO-код (RUB, USD, EUR...). По умолчанию RUB.
- "date" — в формате YYYY-MM-DD. Если даты нет — null.
- "merchant" — название магазина/получателя как в источнике.
- "category" — ВЫБЕРИ строго одно значение из списка доступных категорий. Если не уверен — "Другое".
- "type" — "expense" для списания/покупки, "income" для поступления.
- "confidence" — целое 0..100, насколько ты уверен в сумме И категории.
- Если данных недостаточно для уверенной категоризации (confidence < 70) — поставь "needs_clarification": true
  и сформулируй короткий вопрос пользователю в "clarification_question".

Формат ответа (только JSON):
{
  "type": "expense",
  "amount": 4850,
  "currency": "RUB",
  "date": "2026-06-22",
  "merchant": "АЗС Газпромнефть",
  "description": "Покупка топлива",
  "category": "Топливо",
  "confidence": 94,
  "needs_clarification": false,
  "clarification_question": null
}`;
}

/** Безопасный разбор ответа модели в ParsedReceipt. */
export function parseModelJson(raw: string): ParsedReceipt {
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  const slice = jsonStart >= 0 && jsonEnd >= 0 ? raw.slice(jsonStart, jsonEnd + 1) : raw;
  const data = JSON.parse(slice);

  const confidence = clampConfidence(data.confidence);
  return {
    type: data.type === 'income' ? 'income' : 'expense',
    amount: typeof data.amount === 'number' ? data.amount : data.amount ? Number(data.amount) : null,
    currency: data.currency ?? 'RUB',
    date: data.date ?? null,
    merchant: data.merchant ?? null,
    description: data.description ?? null,
    category: data.category ?? null,
    confidence,
    needsClarification: Boolean(data.needs_clarification) || confidence < 70,
    clarificationQuestion: data.clarification_question ?? null,
  };
}

function clampConfidence(value: unknown): number {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
