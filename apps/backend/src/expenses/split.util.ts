import { BadRequestException } from '@nestjs/common';
import { SplitType } from '@prisma/client';
import { ShareInputDto } from './dto/expense.dto';

export interface ComputedShare {
  userId: string;
  amount: number;
  percent: number | null;
}

/**
 * Распределение расхода между участниками (§22).
 * Возвращает доли в денежном выражении; гарантирует, что сумма долей == сумме расхода
 * (остаток от округления добавляется к первой доле).
 */
export function computeShares(
  splitType: SplitType,
  totalAmount: number,
  activeMemberIds: string[],
  shares?: ShareInputDto[],
): ComputedShare[] {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  switch (splitType) {
    case SplitType.NONE:
      return [];

    case SplitType.EQUAL: {
      const ids = activeMemberIds;
      if (ids.length === 0) return [];
      const per = round2(totalAmount / ids.length);
      const result = ids.map((userId) => ({ userId, amount: per, percent: round2(100 / ids.length) }));
      fixRounding(result, totalAmount);
      return result;
    }

    case SplitType.PERCENT: {
      if (!shares?.length) throw new BadRequestException('Для PERCENT нужно передать доли (shares)');
      const totalPercent = shares.reduce((s, sh) => s + (sh.percent ?? 0), 0);
      if (Math.abs(totalPercent - 100) > 0.01) {
        throw new BadRequestException('Сумма процентов должна быть равна 100');
      }
      const result = shares.map((sh) => ({
        userId: sh.userId,
        amount: round2((totalAmount * (sh.percent ?? 0)) / 100),
        percent: sh.percent ?? 0,
      }));
      fixRounding(result, totalAmount);
      return result;
    }

    case SplitType.SHARES: {
      if (!shares?.length) throw new BadRequestException('Для SHARES нужно передать доли (shares)');
      const total = shares.reduce((s, sh) => s + (sh.amount ?? 0), 0);
      if (total - totalAmount > 0.01) {
        throw new BadRequestException('Сумма долей не может превышать сумму расхода');
      }
      return shares.map((sh) => ({
        userId: sh.userId,
        amount: round2(sh.amount ?? 0),
        percent: totalAmount ? round2(((sh.amount ?? 0) / totalAmount) * 100) : null,
      }));
    }

    default:
      return [];
  }
}

function fixRounding(shares: ComputedShare[], total: number) {
  if (!shares.length) return;
  const sum = shares.reduce((s, sh) => s + sh.amount, 0);
  const diff = Math.round((total - sum) * 100) / 100;
  if (diff !== 0) shares[0].amount = Math.round((shares[0].amount + diff) * 100) / 100;
}
