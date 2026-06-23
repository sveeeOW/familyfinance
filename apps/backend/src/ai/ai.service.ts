import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiStatus, ExpenseSource, ExpenseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategorizationService } from '../categorization/categorization.service';
import { ExpensesService } from '../expenses/expenses.service';
import { StorageService } from '../storage/storage.service';
import { RECEIPT_PARSER, ReceiptParser, ParsedReceipt } from './receipt-parser.interface';

export interface RecognitionDraft {
  logId: string;
  portfolioId: string;
  parsed: ParsedReceipt;
  resolvedCategoryId: string | null;
  resolvedCategoryName: string | null;
  status: ExpenseStatus;
  screenshotUrl: string | null;
  duplicateOf: string | null;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly categorization: CategorizationService,
    private readonly expenses: ExpensesService,
    private readonly storage: StorageService,
    @Inject(RECEIPT_PARSER) private readonly parser: ReceiptParser,
  ) {}

  async recognizeText(params: { text: string; userId: string; portfolioId: string }): Promise<RecognitionDraft> {
    const categories = await this.categoryNames(params.portfolioId);
    const history = await this.merchantHistory(params.userId, params.portfolioId);
    const parsed = await this.parser.parseText({
      text: params.text,
      availableCategories: categories,
      previousMerchantCategories: history,
    });
    return this.postProcess(parsed, { ...params, source: ExpenseSource.TELEGRAM_BOT, fileUrl: null });
  }

  async recognizeImage(params: {
    buffer: Buffer;
    mimeType: string;
    userId: string;
    portfolioId: string;
    source?: ExpenseSource;
  }): Promise<RecognitionDraft> {
    let screenshotUrl: string | null = null;

    if (process.env.SAVE_RECOGNITION_FILES === 'true') {
      try {
        screenshotUrl = await this.storage.save(params.buffer, this.extFromMime(params.mimeType));
      } catch (error) {
        this.logger.warn(`Скриншот не сохранён, продолжаю распознавание: ${(error as Error).message}`);
      }
    }

    const categories = await this.categoryNames(params.portfolioId);
    const history = await this.merchantHistory(params.userId, params.portfolioId);
    const parsed = await this.parser.parseImage({
      imageBase64: params.buffer.toString('base64'),
      mimeType: params.mimeType,
      availableCategories: categories,
      previousMerchantCategories: history,
    });
    return this.postProcess(parsed, {
      userId: params.userId,
      portfolioId: params.portfolioId,
      source: params.source ?? ExpenseSource.TELEGRAM_BOT,
      fileUrl: screenshotUrl,
    });
  }

  async recognizePdfStatement(params: {
    buffer: Buffer;
    filename: string;
    userId: string;
    portfolioId: string;
  }): Promise<RecognitionDraft[]> {
    if (!this.parser.parsePdfStatement) {
      throw new Error('Текущий AI-провайдер не поддерживает PDF. Установите AI_PROVIDER=openai.');
    }

    const categories = await this.categoryNames(params.portfolioId);
    const history = await this.merchantHistory(params.userId, params.portfolioId);
    const parsed = await this.parser.parsePdfStatement({
      fileBase64: params.buffer.toString('base64'),
      filename: params.filename,
      availableCategories: categories,
      previousMerchantCategories: history,
    });

    const drafts: RecognitionDraft[] = [];
    for (const operation of parsed.filter((item) => item.type !== 'income' && item.amount).slice(0, 20)) {
      drafts.push(
        await this.postProcess(operation, {
          userId: params.userId,
          portfolioId: params.portfolioId,
          source: ExpenseSource.TELEGRAM_BOT,
          fileUrl: null,
        }),
      );
    }
    return drafts;
  }

  private async postProcess(
    parsed: ParsedReceipt,
    ctx: { userId: string; portfolioId: string; source: ExpenseSource; fileUrl: string | null },
  ): Promise<RecognitionDraft> {
    let resolvedCategoryId = await this.categoryIdByName(parsed.category, ctx.portfolioId);
    let resolvedCategoryName = parsed.category;

    const ruleMatch = await this.categorization.match(
      `${parsed.merchant ?? ''} ${parsed.description ?? parsed.extractedText ?? ''}`,
      { userId: ctx.userId, portfolioId: ctx.portfolioId },
    );
    if (!resolvedCategoryId && ruleMatch.categoryId) {
      resolvedCategoryId = ruleMatch.categoryId;
      resolvedCategoryName = ruleMatch.categoryName;
      parsed.confidence = Math.max(parsed.confidence, ruleMatch.confidence);
    }
    if (!resolvedCategoryId) {
      resolvedCategoryId = await this.categorization.fallbackCategoryId();
      resolvedCategoryName = 'Другое';
    }

    if (parsed.amount && resolvedCategoryId && parsed.confidence >= 45) {
      parsed.needsClarification = false;
    }

    const status = this.statusFromConfidence(parsed);

    let duplicateOf: string | null = null;
    if (parsed.amount) {
      const dup = await this.expenses.findPotentialDuplicate({
        portfolioId: ctx.portfolioId,
        paidByUserId: ctx.userId,
        amount: parsed.amount,
        merchant: parsed.merchant,
        date: parsed.date ? new Date(parsed.date) : new Date(),
      });
      duplicateOf = dup?.id ?? null;
    }

    const log = await this.prisma.aiRecognitionLog.create({
      data: {
        userId: ctx.userId,
        portfolioId: ctx.portfolioId,
        source: ctx.source,
        originalFileUrl: ctx.fileUrl,
        extractedText: parsed.extractedText,
        parsedAmount: parsed.amount ?? undefined,
        parsedDate: parsed.date ? new Date(parsed.date) : undefined,
        parsedMerchant: parsed.merchant,
        parsedCategoryId: resolvedCategoryId,
        confidence: parsed.confidence,
        status: this.aiStatus(status),
      },
    });

    return {
      logId: log.id,
      portfolioId: ctx.portfolioId,
      parsed,
      resolvedCategoryId,
      resolvedCategoryName,
      status,
      screenshotUrl: ctx.fileUrl,
      duplicateOf,
    };
  }

  async confirmRecognition(params: {
    logId: string;
    userId: string;
    categoryId?: string;
    portfolioId?: string;
    force?: boolean;
  }) {
    const log = await this.prisma.aiRecognitionLog.findUnique({ where: { id: params.logId } });
    if (!log) throw new NotFoundException('Запись распознавания не найдена');
    if (log.createdExpenseId) {
      return { alreadyCreated: true, expenseId: log.createdExpenseId };
    }

    const portfolioId = params.portfolioId ?? log.portfolioId!;
    const categoryId = params.categoryId ?? log.parsedCategoryId ?? undefined;

    if (!log.parsedAmount || Number(log.parsedAmount) <= 0) {
      throw new Error('Не удалось определить сумму расхода');
    }

    const expense = await this.expenses.createFromRecognition({
      portfolioId,
      enteredByUserId: params.userId,
      paidByUserId: log.userId ?? params.userId,
      amount: Number(log.parsedAmount),
      date: log.parsedDate ?? new Date(),
      categoryId,
      merchant: log.parsedMerchant,
      description: log.extractedText,
      source: log.source,
      status: ExpenseStatus.CONFIRMED,
      confidence: log.confidence ?? undefined,
      screenshotUrl: log.originalFileUrl,
    });

    await this.prisma.aiRecognitionLog.update({
      where: { id: log.id },
      data: { status: AiStatus.CONFIRMED, createdExpenseId: expense.id, parsedCategoryId: categoryId },
    });

    if (log.parsedMerchant && categoryId) {
      await this.categorization.learn({
        keyword: log.parsedMerchant,
        categoryId,
        userId: params.userId,
        portfolioId,
      });
    }

    return { expenseId: expense.id, expense };
  }

  async updateCategoryRule(params: {
    userId: string;
    portfolioId?: string;
    merchant: string;
    categoryId: string;
  }) {
    await this.categorization.learn({
      keyword: params.merchant,
      categoryId: params.categoryId,
      userId: params.userId,
      portfolioId: params.portfolioId,
    });
    return { success: true };
  }

  private statusFromConfidence(parsed: ParsedReceipt): ExpenseStatus {
    if (parsed.amount == null) return ExpenseStatus.NEEDS_CLARIFICATION;
    if (parsed.needsClarification || parsed.confidence < 45) return ExpenseStatus.NEEDS_CLARIFICATION;
    return ExpenseStatus.PENDING;
  }

  private aiStatus(status: ExpenseStatus): AiStatus {
    switch (status) {
      case ExpenseStatus.CONFIRMED:
        return AiStatus.CONFIRMED;
      case ExpenseStatus.NEEDS_CLARIFICATION:
        return AiStatus.NEEDS_CLARIFICATION;
      case ExpenseStatus.RECOGNITION_ERROR:
        return AiStatus.ERROR;
      default:
        return AiStatus.PENDING;
    }
  }

  private async categoryNames(portfolioId: string): Promise<string[]> {
    const cats = await this.prisma.category.findMany({
      where: { isActive: true, OR: [{ portfolioId: null, isSystem: true }, { portfolioId }] },
      select: { name: true },
    });
    return [...new Set(cats.map((c) => c.name))];
  }

  private async categoryIdByName(name: string | null, portfolioId: string): Promise<string | null> {
    if (!name) return null;
    const cat = await this.prisma.category.findFirst({
      where: {
        isActive: true,
        name: { equals: name, mode: 'insensitive' },
        OR: [{ portfolioId: null, isSystem: true }, { portfolioId }],
      },
    });
    return cat?.id ?? null;
  }

  private async merchantHistory(userId: string, portfolioId: string) {
    const recent = await this.prisma.expense.findMany({
      where: { portfolioId, merchant: { not: null }, categoryId: { not: null } },
      select: { merchant: true, category: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const seen = new Set<string>();
    const result: { merchant: string; category: string }[] = [];
    for (const r of recent) {
      if (r.merchant && r.category && !seen.has(r.merchant)) {
        seen.add(r.merchant);
        result.push({ merchant: r.merchant, category: r.category.name });
      }
    }
    return result;
  }

  private extFromMime(mime: string): string {
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    return 'jpg';
  }
}
