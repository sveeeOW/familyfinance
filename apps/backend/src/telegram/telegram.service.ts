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
    this.bot.catch((error) => {
      this.logger.error(`Telegram handler error: ${(error as Error).message}`, (error as Error).stack);
    });
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

  async handleUpdate(update: unknown) {
    if (!this.bot) return;
    await this.bot.handleUpdate(update as any);
  }

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

  private registerHandlers() {
    const bot = this.bot!;

    bot.start(async (ctx) => {
      const payload = (ctx.payload ?? '').trim();
      const tgId = String(ctx.from.id);
      if (payload) {
        const res = await this.links.linkByCode(payload, tgId);
        if (res.ok) {
          await ctx.reply('✅ Аккаунт привязан! Теперь присылайте мне скриншоты чеков, PDF-выписки или пишите о тратах текстом.');
        } else {
          await ctx.reply(`❌ ${res.reason}. Сгенерируйте новый код в приложении (Настройки → Telegram-бот).`);
        }
        return;
      }
      const user = await this.userByTelegram(tgId);
      if (user) {
        await ctx.reply('Привет! Пришлите скриншот чека, PDF-выписку или напишите трату текстом, например: «22628 кредит авто».');
      } else {
        await ctx.reply('Чтобы начать, привяжите аккаунт: откройте приложение → Настройки → «Подключить Telegram-бота» и перейдите по ссылке.');
      }
    });

    bot.help((ctx) =>
      ctx.reply('Я добавляю расходы в Family Finance.\n• Пришлите скриншот чека — распознаю сумму и категорию.\n• Пришлите PDF-выписку — найду расходы.\n• Или напишите: «1200 такси».\n• Подтвердите кнопкой — расход появится в приложении.'),
    );

    bot.on('photo', async (ctx) => this.onPhoto(ctx));
    bot.on('document', async (ctx) => this.onDocument(ctx));
    bot.on('text', async (ctx) => this.onText(ctx));

    bot.action(/^confirm:(.+)$/, async (ctx) => this.onConfirm(ctx, ctx.match[1]));
    bot.action(/^force:(.+)$/, async (ctx) => this.onConfirm(ctx, ctx.match[1], true));
    bot.action(/^cancel:(.+)$/, async (ctx) => {
      this.sessions.delete(String(ctx.from!.id));
      await this.safeAnswer(ctx, 'Отменено');
      await this.safeEditOrReply(ctx, '❌ Расход не добавлен.');
    });
    bot.action(/^pickcat:(.+)$/, async (ctx) => this.onPickCategory(ctx, ctx.match[1]));
    bot.action(/^setcat:([^:]+):(.+)$/, async (ctx) => this.onSetCategory(ctx, ctx.match[1], ctx.match[2]));
    bot.action(/^pickport:(.+)$/, async (ctx) => this.onPickPortfolio(ctx, ctx.match[1]));
    bot.action(/^setport:([^:]+):(.+)$/, async (ctx) => this.onSetPortfolio(ctx, ctx.match[1], ctx.match[2]));
  }

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
      const fileId = photos[photos.length - 1].file_id;
      const buffer = await this.downloadTelegramFile(ctx, fileId);
      const draft = await this.ai.recognizeImage({
        buffer,
        mimeType: 'image/jpeg',
        userId: user.id,
        portfolioId,
      });
      await this.presentDraft(ctx, user.id, draft);
    } catch (e) {
      this.logger.error(`Ошибка распознавания фото: ${(e as Error).message}`, (e as Error).stack);
      await ctx.reply('Не удалось распознать изображение. Напишите трату текстом, например: «22628 кредит авто».');
    }
  }

  private async onDocument(ctx: any) {
    const tgId = String(ctx.from.id);
    const user = await this.userByTelegram(tgId);
    if (!user) {
      await ctx.reply('Сначала привяжите аккаунт через приложение (Настройки → Telegram-бот).');
      return;
    }

    const doc = ctx.message.document;
    const filename = doc.file_name ?? 'statement.pdf';
    const mimeType = doc.mime_type ?? '';
    const isPdf = mimeType.includes('pdf') || filename.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      await ctx.reply('Пока я умею читать только PDF-выписки. Пришлите PDF-файл или фото чека.');
      return;
    }

    const portfolioId = await this.defaultPortfolioId(user.id);
    if (!portfolioId) {
      await ctx.reply('У вас нет доступных портфелей. Создайте портфель в приложении.');
      return;
    }

    await ctx.reply('📄 Читаю PDF-выписку. Это может занять до минуты…');
    try {
      const buffer = await this.downloadTelegramFile(ctx, doc.file_id);
      const drafts = await this.ai.recognizePdfStatement({
        buffer,
        filename,
        userId: user.id,
        portfolioId,
      });

      if (!drafts.length) {
        await ctx.reply('Не нашёл явных расходов в PDF. Возможно, выписка защищена, отсканирована картинкой или в ней нет операций списания.');
        return;
      }

      await ctx.reply(`Нашёл операций: ${drafts.length}. Отправляю их на подтверждение по одной.`);
      for (const draft of drafts) {
        await this.presentDraft(ctx, user.id, draft);
      }
    } catch (e) {
      this.logger.error(`Ошибка разбора PDF: ${(e as Error).message}`, (e as Error).stack);
      await ctx.reply(`Не удалось прочитать PDF: ${(e as Error).message}`);
    }
  }

  private async presentDraft(ctx: any, userId: string, draft: RecognitionDraft) {
    const tgId = String(ctx.from.id);
    this.sessions.set(tgId, { draft });

    const p = draft.parsed;
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
    await this.safeAnswer(ctx, 'Добавляю…');
    const user = await this.userByTelegram(tgId);
    if (!user) {
      await this.safeReply(ctx, 'Аккаунт не привязан. Сначала подключите Telegram в приложении.');
      return;
    }
    try {
      const res = await this.ai.confirmRecognition({ logId, userId: user.id, force });
      this.sessions.delete(tgId);
      const text = res.alreadyCreated ? '✅ Этот расход уже был добавлен ранее.' : '✅ Расход добавлен в приложение.';
      await this.safeEditOrReply(ctx, text);
      return res;
    } catch (e) {
      this.logger.error(`Не удалось подтвердить расход: ${(e as Error).message}`, (e as Error).stack);
      await this.safeReply(ctx, `Не удалось добавить: ${(e as Error).message}`);
    }
  }

  private async onPickCategory(ctx: any, logId: string) {
    await this.safeAnswer(ctx, 'Открываю категории…');
    try {
      const log = await this.prisma.aiRecognitionLog.findUnique({ where: { id: logId } });
      if (!log?.portfolioId) {
        await this.safeReply(ctx, 'Сессия устарела. Отправьте расход ещё раз.');
        return;
      }
      const cats = await this.prisma.category.findMany({
        where: { isActive: true, OR: [{ portfolioId: null, isSystem: true }, { portfolioId: log.portfolioId }] },
        orderBy: { name: 'asc' },
        take: 30,
      });
      const buttons = cats.map((c) => [Markup.button.callback(c.name, `setcat:${logId}:${c.id}`)]);
      await this.safeReply(ctx, 'Выберите категорию:', Markup.inlineKeyboard(buttons));
    } catch (e) {
      this.logger.error(`Ошибка выбора категории: ${(e as Error).message}`, (e as Error).stack);
      await this.safeReply(ctx, 'Не удалось открыть список категорий. Попробуйте ещё раз.');
    }
  }

  private async onSetCategory(ctx: any, logId: string, categoryId: string) {
    await this.safeAnswer(ctx, 'Категория обновляется…');
    try {
      await this.prisma.aiRecognitionLog.update({ where: { id: logId }, data: { parsedCategoryId: categoryId } });
      const cat = await this.prisma.category.findUnique({ where: { id: categoryId } });
      await this.safeReply(
        ctx,
        `Категория: ${cat?.name}. Добавить расход?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Да, добавить', `confirm:${logId}`)],
          [Markup.button.callback('❌ Отмена', `cancel:${logId}`)],
        ]),
      );
    } catch (e) {
      this.logger.error(`Ошибка обновления категории: ${(e as Error).message}`, (e as Error).stack);
      await this.safeReply(ctx, 'Не удалось изменить категорию. Попробуйте ещё раз.');
    }
  }

  private async onPickPortfolio(ctx: any, logId: string) {
    const tgId = String(ctx.from!.id);
    await this.safeAnswer(ctx, 'Открываю портфели…');
    const user = await this.userByTelegram(tgId);
    if (!user) {
      await this.safeReply(ctx, 'Аккаунт не привязан.');
      return;
    }
    try {
      const portfolios = await this.prisma.portfolio.findMany({
        where: { members: { some: { userId: user.id, status: 'ACTIVE' } } },
      });
      const buttons = portfolios.map((p) => [Markup.button.callback(p.name, `setport:${logId}:${p.id}`)]);
      await this.safeReply(ctx, 'Выберите портфель:', Markup.inlineKeyboard(buttons));
    } catch (e) {
      this.logger.error(`Ошибка выбора портфеля: ${(e as Error).message}`, (e as Error).stack);
      await this.safeReply(ctx, 'Не удалось открыть список портфелей. Попробуйте ещё раз.');
    }
  }

  private async onSetPortfolio(ctx: any, logId: string, portfolioId: string) {
    await this.safeAnswer(ctx, 'Портфель обновляется…');
    try {
      await this.prisma.aiRecognitionLog.update({ where: { id: logId }, data: { portfolioId } });
      const portfolio = await this.prisma.portfolio.findUnique({ where: { id: portfolioId } });
      await this.safeReply(
        ctx,
        `Портфель: ${portfolio?.name}. Добавить расход?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Да, добавить', `confirm:${logId}`)],
          [Markup.button.callback('❌ Отмена', `cancel:${logId}`)],
        ]),
      );
    } catch (e) {
      this.logger.error(`Ошибка обновления портфеля: ${(e as Error).message}`, (e as Error).stack);
      await this.safeReply(ctx, 'Не удалось изменить портфель. Попробуйте ещё раз.');
    }
  }

  private async downloadTelegramFile(ctx: any, fileId: string): Promise<Buffer> {
    const link = await ctx.telegram.getFileLink(fileId);
    const resp = await fetch(link.href);
    if (!resp.ok) throw new Error(`Не удалось скачать файл Telegram: ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  }

  private async safeAnswer(ctx: any, text?: string) {
    try {
      await ctx.answerCbQuery(text);
    } catch (e) {
      this.logger.warn(`answerCbQuery failed: ${(e as Error).message}`);
    }
  }

  private async safeReply(ctx: any, text: string, extra?: any) {
    try {
      await ctx.reply(text, extra);
    } catch (e) {
      this.logger.warn(`reply failed: ${(e as Error).message}`);
    }
  }

  private async safeEditOrReply(ctx: any, text: string) {
    try {
      await ctx.editMessageText(text);
    } catch (e) {
      this.logger.warn(`editMessageText failed: ${(e as Error).message}`);
      await this.safeReply(ctx, text);
    }
  }

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
