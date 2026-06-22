import { Injectable } from '@nestjs/common';
import {
  ParseImageInput,
  ParseTextInput,
  ParsedReceipt,
  ReceiptParser,
} from '../receipt-parser.interface';

/**
 * Детерминированный парсер без внешних вызовов (AI_PROVIDER=mock).
 * Используется для разработки и тестов: извлекает сумму регэкспом и угадывает
 * категорию по ключевым словам. Для изображений возвращает «требует уточнения».
 */
@Injectable()
export class MockReceiptParser implements ReceiptParser {
  async parseImage(_input: ParseImageInput): Promise<ParsedReceipt> {
    return {
      type: 'expense',
      amount: null,
      currency: 'RUB',
      date: new Date().toISOString().slice(0, 10),
      merchant: null,
      description: 'Скриншот получен (mock-режим: распознавание изображений выключено)',
      category: null,
      confidence: 40,
      needsClarification: true,
      clarificationQuestion: 'Опишите трату текстом — какая это была покупка?',
      extractedText: null,
    };
  }

  async parseText(input: ParseTextInput): Promise<ParsedReceipt> {
    const text = input.text.toLowerCase();
    const amountMatch = input.text.replace(/\s/g, '').match(/(\d+[.,]?\d*)/);
    const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : null;

    const guess = this.guessCategory(text, input.availableCategories);
    const merchant = this.guessMerchant(input.text);

    return {
      type: 'expense',
      amount,
      currency: 'RUB',
      date: new Date().toISOString().slice(0, 10),
      merchant,
      description: input.text,
      category: guess.category,
      confidence: amount ? guess.confidence : 30,
      needsClarification: !amount || guess.confidence < 70,
      clarificationQuestion: !amount
        ? 'Не вижу сумму. Сколько потрачено?'
        : guess.confidence < 70
          ? 'Не уверен в категории. Что это за трата?'
          : null,
      extractedText: input.text,
    };
  }

  private guessCategory(text: string, available: string[]): { category: string | null; confidence: number } {
    const rules: { kw: string[]; cat: string }[] = [
      { kw: ['продукт', 'перекрёст', 'перекрест', 'пятёроч', 'пятероч', 'магнит', 'лента', 'ашан', 'вкусвилл'], cat: 'Продукты' },
      { kw: ['азс', 'бензин', 'топлив', 'газпромнефть', 'лукойл'], cat: 'Топливо' },
      { kw: ['такси', 'яндекс go', 'uber'], cat: 'Такси' },
      { kw: ['ресторан', 'кафе', 'бар', 'пицц', 'суши', 'бургер'], cat: 'Рестораны и кафе' },
      { kw: ['аптек', 'лекарств'], cat: 'Аптеки' },
      { kw: ['ozon', 'wildberries', 'озон', 'wb', 'маркет'], cat: 'Маркетплейсы' },
      { kw: ['корм', 'ветеринар', 'зоомагаз'], cat: 'Домашние животные' },
    ];
    for (const r of rules) {
      if (r.kw.some((k) => text.includes(k)) && available.includes(r.cat)) {
        return { category: r.cat, confidence: 85 };
      }
    }
    return { category: available.includes('Другое') ? 'Другое' : null, confidence: 45 };
  }

  private guessMerchant(text: string): string | null {
    const known = ['Перекрёсток', 'Пятёрочка', 'Магнит', 'Лента', 'Ozon', 'Wildberries', 'Газпромнефть', 'Лукойл'];
    return known.find((m) => text.toLowerCase().includes(m.toLowerCase())) ?? null;
  }
}
