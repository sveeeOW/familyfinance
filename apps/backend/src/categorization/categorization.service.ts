import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CategoryMatch {
  categoryId: string | null;
  categoryName: string | null;
  confidence: number; // 0..100, вклад правил в общую уверенность
  matchedKeyword: string | null;
}

/**
 * Rule-based категоризация (§9.3) + обучение на действиях пользователя (§11.4).
 * Используется и для текстовых сообщений в боте, и как фолбэк/усиление AI-результата.
 */
@Injectable()
export class CategorizationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Подбирает категорию по тексту (merchant + описание). Сначала ищет персональные/портфельные
   * правила (приоритет обучения), затем системные. Возвращает наиболее «тяжёлое» совпадение.
   */
  async match(text: string, opts: { userId?: string; portfolioId?: string }): Promise<CategoryMatch> {
    const haystack = (text ?? '').toLowerCase();
    if (!haystack.trim()) {
      return { categoryId: null, categoryName: null, confidence: 0, matchedKeyword: null };
    }

    const rules = await this.prisma.categoryRule.findMany({
      where: {
        OR: [
          { isSystem: true },
          opts.userId ? { userId: opts.userId } : undefined,
          opts.portfolioId ? { portfolioId: opts.portfolioId } : undefined,
        ].filter(Boolean) as any,
      },
      include: { category: true },
    });

    let best: { rule: (typeof rules)[number]; score: number } | null = null;
    for (const rule of rules) {
      if (!rule.keyword) continue;
      if (haystack.includes(rule.keyword.toLowerCase())) {
        // Персональные правила и более «выученные» (weight) важнее системных.
        const learnedBoost = rule.isSystem ? 0 : 50;
        const score = rule.keyword.length + rule.weight * 5 + learnedBoost;
        if (!best || score > best.score) best = { rule, score };
      }
    }

    if (!best) {
      return { categoryId: null, categoryName: null, confidence: 0, matchedKeyword: null };
    }

    // Чем сильнее совпадение, тем выше уверенность (ограничиваем сверху).
    const confidence = Math.min(95, 55 + best.rule.weight * 8 + (best.rule.isSystem ? 0 : 20));
    return {
      categoryId: best.rule.categoryId,
      categoryName: best.rule.category.name,
      confidence,
      matchedKeyword: best.rule.keyword,
    };
  }

  /**
   * Обучение: пользователь подтвердил/исправил категорию для продавца (§11.4).
   * Усиливаем существующее правило или создаём персональное.
   */
  async learn(params: {
    keyword: string;
    categoryId: string;
    userId?: string;
    portfolioId?: string;
  }) {
    const keyword = params.keyword.trim().toLowerCase();
    if (!keyword) return;

    const existing = await this.prisma.categoryRule.findFirst({
      where: {
        keyword,
        categoryId: params.categoryId,
        isSystem: false,
        OR: [
          params.userId ? { userId: params.userId } : undefined,
          params.portfolioId ? { portfolioId: params.portfolioId } : undefined,
        ].filter(Boolean) as any,
      },
    });

    if (existing) {
      await this.prisma.categoryRule.update({
        where: { id: existing.id },
        data: { weight: { increment: 1 } },
      });
    } else {
      await this.prisma.categoryRule.create({
        data: {
          keyword,
          categoryId: params.categoryId,
          userId: params.userId,
          portfolioId: params.portfolioId,
          weight: 1,
        },
      });
    }
  }

  /** Категория «Другое» как безопасный фолбэк. */
  async fallbackCategoryId(): Promise<string | null> {
    const other = await this.prisma.category.findFirst({
      where: { isSystem: true, name: 'Другое' },
    });
    return other?.id ?? null;
  }
}
