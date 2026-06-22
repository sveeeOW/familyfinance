// Контракт распознавания чеков/уведомлений (§11, §21).
// За интерфейсом может стоять любой провайдер: vision-LLM, Tesseract+LLM и т.п.

export interface ParsedReceipt {
  type: 'expense' | 'income';
  amount: number | null;
  currency: string;
  date: string | null; // ISO yyyy-mm-dd
  merchant: string | null;
  description: string | null;
  category: string | null; // имя категории как его видит модель
  confidence: number; // 0..100
  needsClarification: boolean;
  clarificationQuestion: string | null;
  extractedText?: string | null;
}

export interface ParseImageInput {
  imageBase64: string;
  mimeType: string;
  availableCategories: string[];
  previousMerchantCategories?: { merchant: string; category: string }[];
}

export interface ParseTextInput {
  text: string;
  availableCategories: string[];
  previousMerchantCategories?: { merchant: string; category: string }[];
}

export const RECEIPT_PARSER = Symbol('RECEIPT_PARSER');

export interface ReceiptParser {
  parseImage(input: ParseImageInput): Promise<ParsedReceipt>;
  parseText(input: ParseTextInput): Promise<ParsedReceipt>;
}
