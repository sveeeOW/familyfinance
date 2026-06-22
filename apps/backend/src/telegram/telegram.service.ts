import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { Telegraf, Markup } from 'telegraf';
import { ExpenseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService, RecognitionDraft } from '../ai/ai.service';
import { TelegramLinkService } from './telegram-link.service';

interface SessionState {
  draft?: RecognitionDraft;
  awaitingClarification?: boolean;
}

/**
 * Telegram-бот (§10). Запускается только если задан TELEGRAM_BOT_TOKEN.
 * В dev — long polling; если задан TELEGRAM_WEBHOOK_DOMAIN — webhook.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);
  private bot?: Telegraf;
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly links: TelegramLinkService,
  ) {}

  async onModuleInit() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN не задан — Telegram-бот выключен');
      return;
    }
    this.bot = new Telegraf(token);
    this.registerHandlers();

    const domain = process.env.TELEGRAM_WEBHOOK_DOMAIN;
    if (domain) {
      await this.bot.telegram.setWebhook(`${domain}/telegram/webhook`);
      this.logger.log(`Telegram-бот: webhook ${domain}/telegram/webhook`);
    } else {
      this.bot.launch().catch((e) => this.logger.error(`Ошибка запуска бота: ${e.message}`));
      this.logger.log('Telegram-бот запущен (long polling)');
    }
  }

  onApplicationShutdown() {
    this.bot?.stop();
  }

  /** Обработка обновления из webhook (POST /telegram/webhook). */
  async handleUpdate(update: unknown) {
    if (!this.bot) return;
    await this.bot.handleUpdate(update as any);
  }

  /** Отправка произвольного сообщения пользователю (для уведомлений, §15). */
  async sendMessage(telegramId: string, text: string) {
    if (!this.bot) {
      this.logger.warn(`Бот выключен, уведомление не отправлено: ${text}`);
      return;
    }
    try {
      await this.bot.telegram.sendMessage(telegramId, text);
    } catch (e) {
      this.logger.error(`Не удалось отправить уведомление: ${(e as Error).message}`);
    }
  }

  // ─── Регистрация обработчиков ─────────────────────────────────────────────
  private registerHandlers() {
    const bot = this.bot!;

    bot.start(async (ctx) => {
      const payload = (ctx.payload ?? '').trim();
      const tgId = String(ctx.from.id);
      if (payload) {
        const res = await this.links.linkByCode(payload, tgId);
        if (res.ok) {
          await ctx.reply('✅ Аккаунт привязан! Теперь присылайте мне скриншоты чеков или пишите о тратах текстом.');
        } else {
          await ctx.reply(`❌ ${res.reason}. Сгенерируйте новый код в приложении (Настройки → Telegram-бот).`);
        }
        return;
      }
      const user = await this.userByTelegram(tgId);
      if (user) {
        await ctx.reply('Привет! Пришлите скриншот чека/уведомления или напишите трату текстом, например: «Потратил 2500 на продукты в Перекрёстке».');
      } else {
        await ctx.reply('Чтобы начать, привяжите аккаунт: откройте приложение → Настройки → «Подключить Telegram-бота» и перейдите по ссылке.');
      }
    });

    bot.help((ctx) =>
      ctx.reply('Я добавляю расходы в Family Finance.\n• Пришлите скриншот чека — распознаю сумму и категорию.\n• Или напишите: «1200 такси».\n• Подтвердите кнопкой — расход появится в приложении.'),
    );

    bot.on('photo', async (ctx) => this.onPhoto(ctx));
    bot.on('text', async (ctx) => this.onText(ctx));

    // Inline-кнопки
    bot.action(/^confirm:(.+)$/, async (ctx) => this.onConfirm(ctx, ctx.match[1]));
    bot.action(/^force:(.+)$/, async (ctx) => this.onConfirm(ctx, ctx.match[1], true));
    bot.action(/^cancel:(.+)$/, async (ctx) => {
      this.sessions.delete(String(ctx.from!.id));
      await ctx.answerCbQuery('Отменено');
      await ctx.editMessageText('❌ Расход не добавлен.');
    });
    bot.action(/^pickcat:(.+)$/, async (ctx) => this.onPickCategory(ctx, ctx.match[1]));
    bot.action(/^setcat:([^:]+):(.+)$/, async (ctx) => this.onSetCategory(ctx, ctx.match[1], ctx.match[2]));
    bot.action(/^pickport:(.+)$/, async (ctx) => this.onPickPortfolio(ctx, ctx.match[1]));
    bot.action(/^setport:([^:]+):(.+)$/, async (ctx) => this.onSetPortfolio(ctx, ctx.match[1], ctx.match[2]));
  }

  // ─── Входящие сообщения ───────────────────────────────────────────────────
  private async onText(ctx: any) {
    const tgId = String(ctx.from.id);
    const user = await this.userByTelegram(tgId);
    if (!user) {
      await ctx.reply('Сначала привяжите аккаунт через приложение (Настройки → Telegram-бот).');
      return;
    }
    const text: string = ctx.message.text;
    if (text.startsWith('/')) return;

    const portfolioId = await this.defaultPortfolioId(user.id);
    if (!portfolioId) {
      await ctx.reply('У вас нет доступных портфелей. Создайте портфель в приложении.');
      return;
    }

    await ctx.reply('🔎 Анализирую…');
    const draft = await this.ai.recognizeText({ text, userId: user.id, portfolioId });
    await this.presentDraft(ctx, user.id, draft);
  }

  private async onPhoto(ctx: any) {
    const tgId = String(ctx.from.id);
    const user = await this.userByTelegram(tgId);
    if (!user) {
      await ctx.reply('Сначала привяжите аккаунт через приложение (Настройки → Telegram-бот).');
      return;
    }
    const portfolioId = await this.defaultPortfolioId(user.id);
    if (!portfolioId) {
      await ctx.reply('У вас нет доступных портфелей. Создайте портфель в приложении.');
      return;
    }

    await ctx.reply('🔎 Распознаю чек…');
    try {
      const photos = ctx.message.photo;
      const fileId = photos[photos.length - 1].file_id; // максимальное разрешение
      const link = await ctx.telegram.getFileLink(fileId);
      const resp = await fetch(link.href);
      const buffer = Buffer.from(await resp.arrayBuffer());

      const draft = await this.ai.recognizeImage({
        buffer,
        mimeType: 'image/jpeg',
        userId: user.id,
        portfolioId,
      });
      await this.presentDraft(ctx, user.id, draft);
    } catch (e) {
      this.logger.error(`Ошибка распознавания фото: ${(e as Error).message}`);
      await ctx.reply('Не удалось обработать изображение. Попробуйте ещё раз или опишите трату текстом.');
    }
  }

  // ─── Показ распознанного расхода (§10.4 / §10.5 / §28) ────────────────────
  private async presentDraft(ctx: any, userId: string, draft: RecognitionDraft) {
    const tgId = String(ctx.from.id);
    this.sessions.set(tgId, { draft });

    const p = draft.parsed;

    // §10.5 — непонятный расход
    if (draft.status === ExpenseStatus.NEEDS_CLARIFICATION && !p.amount) {
      await ctx.reply(p.clarificationQuestion ?? 'Не смог распознать сумму. Опишите трату: например «1500 продукты».');
      return;
    }

    const portfolio = await this.prisma.portfolio.findUnique({ where: { id: draft.portfolioId } });
    const amountStr = p.amount ? `${this.fmt(p.amount)} ${p.currency}` : '—';
    const lines = [
      draft.duplicateOf ? '⚠️ Похожий расход уже есть. Всё равно добавить?\n' : 'Нашёл расход:\n',
      `Сумма: ${amountStr}`,
      `Категория: ${draft.resolvedCategoryName ?? 'Другое'}`,
      `Описание: ${p.merchant ?? p.description ?? '—'}`,
      `Портфель: ${portfolio?.name ?? '—'}`,
      `Дата: ${p.date ?? new Date().toISOString().slice(0, 10)}`,
      `Уверенность: ${p.confidence}%`,
    ];
    if (draft.status === ExpenseStatus.NEEDS_CLARIFICATION) {
      lines.push('\n❓ Не уверен в категории — проверьте перед добавлением.');
    }

    const confirmAction = draft.duplicateOf ? `force:${draft.logId}` : `confirm:${draft.logId}`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(draft.duplicateOf ? '✅ Да, всё равно добавить' : '✅ Да, добавить', confirmAction)],
      [Markup.button.callback('🏷 Изменить категорию', `pickcat:${draft.logId}`)],
      [Markup.button.callback('📁 Изменить портфель', `pickport:${draft.logId}`)],
      [Markup.button.callback('❌ Отмена', `cancel:${draft.logId}`)],
    ]);
    await ctx.reply(lines.join('\n'), keyboard);
  }

  private async onConfirm(ctx: any, logId: string, force = false) {
    const tgId = String(ctx.from!.id);
    const user = await this.userByTelegram(tgId);
    if (!user) return ctx.answerCbQuery('Аккаунт не привязан');
    try {
      const res = await this.ai.confirmRecognition({ logId, userId: user.id, force });
      this.sessions.delete(tgId);
      await ctx.answerCbQuery('Добавлено');
      await ctx.editMessageText('✅ Расход добавлен в приложение.');
      return res;
    } catch (e) {
      await ctx.answerCbQuery('Ошибка');
      await ctx.reply(`Не удалось добавить: ${(e as Error).message}`);
    }
  }

  private async onPickCategory(ctx: any, logId: string) {
    const log = await this.prisma.aiRecognitionLog.findUnique({ where: { id: logId } });
    if (!log?.portfolioId) return ctx.answerCbQuery('Сессия устарела');
    const cats = await this.prisma.category.findMany({
      where: { isActive: true, OR: [{ portfolioId: null, isSystem: true }, { portfolioId: log.portfolioId }] },
      orderBy: { name: 'asc' },
      take: 30,
    });
    const buttons = cats.map((c) => [Markup.button.callback(c.name, `setcat:${logId}:${c.id}`)]);
    await ctx.answerCbQuery();
    await ctx.reply('Выберите категорию:', Markup.inlineKeyboard(buttons));
  }

  private async onSetCategory(ctx: any, logId: string, categoryId: string) {
    await this.prisma.aiRecognitionLog.update({ where: { id: logId }, data: { parsedCategoryId: categoryId } });
    const cat = await this.prisma.category.findUnique({ where: { id: categoryId } });
    await ctx.answerCbQuery('Категория обновлена');
    await ctx.reply(
      `Категория: ${cat?.name}. Добавить расход?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Да, добавить', `confirm:${logId}`)],
        [Markup.button.callback('❌ Отмена', `cancel:${logId}`)],
      ]),
    );
  }

  private async onPickPortfolio(ctx: any, logId: string) {
    const tgId = String(ctx.from!.id);
    const user = await this.userByTelegram(tgId);
    if (!user) return ctx.answerCbQuery('Аккаунт не привязан');
    const portfolios = await this.prisma.portfolio.findMany({
      where: { members: { some: { userId: user.id, status: 'ACTIVE' } } },
    });
    const buttons = portfolios.map((p) => [Markup.button.callback(p.name, `setport:${logId}:${p.id}`)]);
    await ctx.answerCbQuery();
    await ctx.reply('Выберите портфель:', Markup.inlineKeyboard(buttons));
  }

  private async onSetPortfolio(ctx: any, logId: string, portfolioId: string) {
    await this.prisma.aiRecognitionLog.update({ where: { id: logId }, data: { portfolioId } });
    const portfolio = await this.prisma.portfolio.findUnique({ where: { id: portfolioId } });
    await ctx.answerCbQuery('Портфель обновлён');
    await ctx.reply(
      `Портфель: ${portfolio?.name}. Добавить расход?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Да, добавить', `confirm:${logId}`)],
        [Markup.button.callback('❌ Отмена', `cancel:${logId}`)],
      ]),
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private async userByTelegram(telegramId: string) {
    return this.prisma.user.findUnique({ where: { telegramId } });
  }

  private async defaultPortfolioId(userId: string): Promise<string | null> {
    const member = await this.prisma.portfolioMember.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: [{ portfolio: { isDefault: 'desc' } }, { joinedAt: 'asc' }],
      select: { portfolioId: true },
    });
    return member?.portfolioId ?? null;
  }

  private fmt(n: number): string {
    return new Intl.NumberFormat('ru-RU').format(n);
  }
}
