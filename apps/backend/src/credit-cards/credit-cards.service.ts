import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';
import {
  CreateCreditCardChargeDto,
  CreateCreditCardDto,
  CreateCreditCardPaymentDto,
  UpdateCreditCardChargeDto,
  UpdateCreditCardDto,
} from './dto';

@Injectable()
export class CreditCardsService {
  private tablesReady?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
  ) {}

  private ensureTables() {
    if (!this.tablesReady) {
      this.tablesReady = (async () => {
        await this.prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS credit_cards (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
            user_id uuid REFERENCES users(id),
            title text NOT NULL,
            limit_amount numeric(18,2) NOT NULL DEFAULT 0,
            grace_days integer NOT NULL DEFAULT 120,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          );
        `);
        await this.prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS credit_card_charges (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            credit_card_id uuid NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
            user_id uuid REFERENCES users(id),
            title text NOT NULL,
            amount numeric(18,2) NOT NULL,
            remaining_amount numeric(18,2) NOT NULL,
            spent_at date NOT NULL DEFAULT CURRENT_DATE,
            grace_days integer NOT NULL DEFAULT 120,
            ai_log_id uuid,
            closed_at date,
            created_at timestamptz NOT NULL DEFAULT now()
          );
        `);
        await this.prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS credit_card_payments (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            credit_card_id uuid NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
            charge_id uuid REFERENCES credit_card_charges(id) ON DELETE SET NULL,
            user_id uuid REFERENCES users(id),
            amount numeric(18,2) NOT NULL,
            paid_at date NOT NULL DEFAULT CURRENT_DATE,
            created_at timestamptz NOT NULL DEFAULT now()
          );
        `);
        await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_credit_cards_portfolio ON credit_cards(portfolio_id);');
        await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_credit_card_charges_card ON credit_card_charges(credit_card_id, spent_at);');
        await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_credit_card_payments_card ON credit_card_payments(credit_card_id, paid_at);');
      })();
    }
    return this.tablesReady;
  }

  async list(portfolioId: string, userId: string) {
    await this.ensureTables();
    await this.access.requireMember(portfolioId, userId);
    const cards = await this.prisma.$queryRaw<any[]>`
      SELECT id::text, portfolio_id::text AS "portfolioId", user_id::text AS "userId", title,
             limit_amount AS "limitAmount", grace_days AS "graceDays", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM credit_cards
      WHERE portfolio_id = ${portfolioId}::uuid
      ORDER BY created_at ASC
    `;
    const ids = cards.map((c) => c.id);
    if (!ids.length) return [];
    const charges = await this.prisma.$queryRaw<any[]>`
      SELECT id::text, credit_card_id::text AS "creditCardId", user_id::text AS "userId", title,
             amount, remaining_amount AS "remainingAmount", spent_at AS "spentAt", grace_days AS "graceDays",
             ai_log_id::text AS "aiLogId", closed_at AS "closedAt", created_at AS "createdAt"
      FROM credit_card_charges
      WHERE credit_card_id::text = ANY(${ids})
      ORDER BY spent_at DESC, created_at DESC
    `;
    const payments = await this.prisma.$queryRaw<any[]>`
      SELECT id::text, credit_card_id::text AS "creditCardId", charge_id::text AS "chargeId", user_id::text AS "userId",
             amount, paid_at AS "paidAt", created_at AS "createdAt"
      FROM credit_card_payments
      WHERE credit_card_id::text = ANY(${ids})
      ORDER BY paid_at DESC, created_at DESC
    `;
    return cards.map((card) => this.serializeCard(card, charges, payments));
  }

  async create(userId: string, dto: CreateCreditCardDto) {
    await this.ensureTables();
    await this.access.require(dto.portfolioId, userId, 'add');
    const rows = await this.prisma.$queryRaw<any[]>`
      INSERT INTO credit_cards (portfolio_id, user_id, title, limit_amount, grace_days)
      VALUES (${dto.portfolioId}::uuid, ${userId}::uuid, ${dto.title}, ${dto.limitAmount}, ${dto.graceDays ?? 120})
      RETURNING id::text, portfolio_id::text AS "portfolioId", user_id::text AS "userId", title,
                limit_amount AS "limitAmount", grace_days AS "graceDays", created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    return this.serializeCard(rows[0], [], []);
  }

  async update(id: string, userId: string, dto: UpdateCreditCardDto) {
    await this.ensureTables();
    const card = await this.cardById(id);
    await this.access.require(card.portfolioId, userId, 'edit');
    const rows = await this.prisma.$queryRaw<any[]>`
      UPDATE credit_cards
      SET title = COALESCE(${dto.title ?? null}, title),
          limit_amount = COALESCE(${dto.limitAmount ?? null}, limit_amount),
          grace_days = COALESCE(${dto.graceDays ?? null}, grace_days),
          updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id::text, portfolio_id::text AS "portfolioId", user_id::text AS "userId", title,
                limit_amount AS "limitAmount", grace_days AS "graceDays", created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    return this.serializeCard(rows[0], [], []);
  }

  async remove(id: string, userId: string) {
    await this.ensureTables();
    const card = await this.cardById(id);
    await this.access.require(card.portfolioId, userId, 'edit');
    await this.prisma.$executeRaw`DELETE FROM credit_cards WHERE id = ${id}::uuid`;
    return { success: true };
  }

  async createCharge(cardId: string, userId: string, dto: CreateCreditCardChargeDto) {
    await this.ensureTables();
    const card = await this.cardById(cardId);
    await this.access.require(card.portfolioId, userId, 'add');
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Некорректная сумма покупки');
    const title = dto.title?.trim() || 'Покупка по кредитке';
    const spentAt = dto.spentAt ? new Date(dto.spentAt) : new Date();
    const rows = await this.prisma.$queryRaw<any[]>`
      INSERT INTO credit_card_charges (credit_card_id, user_id, title, amount, remaining_amount, spent_at, grace_days, ai_log_id)
      VALUES (${cardId}::uuid, ${userId}::uuid, ${title}, ${amount}, ${amount}, ${spentAt}, ${dto.graceDays ?? card.graceDays}, ${dto.aiLogId ?? null}::uuid)
      RETURNING id::text, credit_card_id::text AS "creditCardId", user_id::text AS "userId", title,
                amount, remaining_amount AS "remainingAmount", spent_at AS "spentAt", grace_days AS "graceDays",
                ai_log_id::text AS "aiLogId", closed_at AS "closedAt", created_at AS "createdAt"
    `;
    return this.serializeCharge(rows[0]);
  }

  async updateCharge(chargeId: string, userId: string, dto: UpdateCreditCardChargeDto) {
    await this.ensureTables();
    const charge = await this.chargeById(chargeId);
    const card = await this.cardById(charge.creditCardId);
    await this.access.require(card.portfolioId, userId, 'edit');
    const paid = Math.max(0, Number(charge.amount) - Number(charge.remainingAmount));
    const nextAmount = dto.amount == null ? Number(charge.amount) : Number(dto.amount);
    const remaining = Math.max(0, nextAmount - paid);
    const rows = await this.prisma.$queryRaw<any[]>`
      UPDATE credit_card_charges
      SET title = COALESCE(${dto.title ?? null}, title),
          amount = ${nextAmount},
          remaining_amount = ${remaining},
          spent_at = COALESCE(${dto.spentAt ? new Date(dto.spentAt) : null}, spent_at),
          closed_at = CASE WHEN ${remaining} = 0 THEN COALESCE(closed_at, CURRENT_DATE) ELSE NULL END
      WHERE id = ${chargeId}::uuid
      RETURNING id::text, credit_card_id::text AS "creditCardId", user_id::text AS "userId", title,
                amount, remaining_amount AS "remainingAmount", spent_at AS "spentAt", grace_days AS "graceDays",
                ai_log_id::text AS "aiLogId", closed_at AS "closedAt", created_at AS "CreatedAt"
    `;
    return this.serializeCharge(rows[0]);
  }

  async removeCharge(chargeId: string, userId: string) {
    await this.ensureTables();
    const charge = await this.chargeById(chargeId);
    const card = await this.cardById(charge.creditCardId);
    await this.access.require(card.portfolioId, userId, 'edit');
    await this.prisma.$executeRaw`DELETE FROM credit_card_charges WHERE id = ${chargeId}::uuid`;
    return { success: true };
  }

  async addPayment(cardId: string, userId: string, dto: CreateCreditCardPaymentDto) {
    await this.ensureTables();
    const card = await this.cardById(cardId);
    await this.access.require(card.portfolioId, userId, 'add');
    let rest = Number(dto.amount);
    if (!Number.isFinite(rest) || rest <= 0) throw new BadRequestException('Некорректная сумма платежа');
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const charges = await this.prisma.$queryRaw<any[]>`
      SELECT id::text, amount, remaining_amount AS "remainingAmount"
      FROM credit_card_charges
      WHERE credit_card_id = ${cardId}::uuid AND remaining_amount > 0
      ORDER BY spent_at ASC, created_at ASC
    `;
    const payments: any[] = [];
    for (const charge of charges) {
      if (rest <= 0) break;
      const applied = Math.min(rest, Number(charge.remainingAmount));
      rest -= applied;
      const nextRemaining = Math.max(0, Number(charge.remainingAmount) - applied);
      await this.prisma.$executeRaw`
        UPDATE credit_card_charges
        SET remaining_amount = ${nextRemaining}, closed_at = CASE WHEN ${nextRemaining} = 0 THEN ${paidAt} ELSE NULL END
        WHERE id = ${charge.id}::uuid
      `;
      const rows = await this.prisma.$queryRaw<any[]>`
        INSERT INTO credit_card_payments (credit_card_id, charge_id, user_id, amount, paid_at)
        VALUES (${cardId}::uuid, ${charge.id}::uuid, ${userId}::uuid, ${applied}, ${paidAt})
        RETURNING id::text, credit_card_id::text AS "creditCardId", charge_id::text AS "chargeId", user_id::text AS "userId", amount, paid_at AS "paidAt", created_at AS "createdAt"
      `;
      payments.push(this.serializePayment(rows[0]));
    }
    return { success: true, payments, unappliedAmount: rest };
  }

  async createChargeFromAi(cardId: string, userId: string, logId: string) {
    await this.ensureTables();
    const log = await this.prisma.aiRecognitionLog.findUnique({ where: { id: logId } });
    if (!log) throw new NotFoundException('Запись распознавания не найдена');
    if (!log.parsedAmount || Number(log.parsedAmount) <= 0) throw new BadRequestException('Не удалось определить сумму покупки');
    const card = await this.cardById(cardId);
    await this.access.require(card.portfolioId, userId, 'add');
    const charge = await this.createCharge(cardId, userId, {
      title: log.parsedMerchant ?? log.extractedText ?? 'Покупка по кредитке',
      amount: Number(log.parsedAmount),
      spentAt: (log.parsedDate ?? new Date()).toISOString(),
      graceDays: card.graceDays,
      aiLogId: log.id,
    });
    await this.prisma.aiRecognitionLog.update({ where: { id: log.id }, data: { status: AiStatus.CONFIRMED } });
    return charge;
  }

  private async cardById(id: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT id::text, portfolio_id::text AS "portfolioId", user_id::text AS "userId", title,
             limit_amount AS "limitAmount", grace_days AS "graceDays"
      FROM credit_cards WHERE id = ${id}::uuid LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Кредитная карта не найдена');
    return this.serializeCard(rows[0], [], []);
  }

  private async chargeById(id: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT id::text, credit_card_id::text AS "creditCardId", amount, remaining_amount AS "remainingAmount"
      FROM credit_card_charges WHERE id = ${id}::uuid LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Покупка по кредитке не найдена');
    return { ...rows[0], amount: Number(rows[0].amount), remainingAmount: Number(rows[0].remainingAmount) };
  }

  private serializeCard(card: any, charges: any[], payments: any[]) {
    const cardCharges = charges.filter((c) => c.creditCardId === card.id).map((c) => this.serializeCharge(c));
    const cardPayments = payments.filter((p) => p.creditCardId === card.id).map((p) => this.serializePayment(p));
    return {
      ...card,
      limitAmount: Number(card.limitAmount),
      graceDays: Number(card.graceDays ?? 120),
      charges: cardCharges,
      payments: cardPayments,
    };
  }

  private serializeCharge(charge: any) {
    return {
      ...charge,
      amount: Number(charge.amount),
      remainingAmount: Number(charge.remainingAmount),
      graceDays: Number(charge.graceDays ?? 120),
      spentAt: this.isoDate(charge.spentAt),
      closedAt: charge.closedAt ? this.isoDate(charge.closedAt) : null,
    };
  }

  private serializePayment(payment: any) {
    return {
      ...payment,
      amount: Number(payment.amount),
      paidAt: this.isoDate(payment.paidAt),
    };
  }

  private isoDate(value: unknown) {
    if (!value) return new Date().toISOString().slice(0, 10);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }
}
