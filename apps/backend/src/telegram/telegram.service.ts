import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ExpenseStatus } from '@prisma/client';
import { Markup, Telegraf } from 'telegraf';
import { AiService, RecognitionDraft } from '../ai/ai.service';
import { CreditCardsService } from '../credit-cards/credit-cards.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramLinkService } from './telegram-link.service';

interface SessionState {
  draft?: RecognitionDraft;
}

type OperationType = 'income' | 'expense' | 'transfer' | 'unknown';

@Injectable()
export class TelegramService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);
  private bot?: Telegraf;
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly links: TelegramLinkService,
    private readonly creditCards: CreditCardsService,
  ) {}

  async onModuleInit() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN не задан — Telegram-бот выключен');
      return;
    }
    this.bot = new Telegraf(token);
    this.bot.catch((error) => this.logger.error(`Telegram handler error: ${(error as Error).message}`, (error as Error).stack));
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
    if (!this.bot) return;
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
        await ctx.reply(res.ok
          ? '✅ Аккаунт привязан! Теперь присылайте скриншоты чеков, PDF-выписки или пишите о тратах текстом.'
          : `❌ ${res.reason}. Сгенерируйте новый код в приложении.`);
        return;
      }
      const user = await this.userByTelegram(tgId);
      await ctx.reply(user
        ? 'Привет! Пришлите скриншот чека, PDF-выписку или напишите трату текстом, например: «22628 кредит авто».'
        : 'Чтобы начать, привяжите аккаунт: откройте приложение → Настройки → «Подключить Telegram-бота».');
    });

    bot.help((ctx) => ctx.reply('Я добавляю операции в Family Finance. Пришлите скрин/фото/PDF или текст. После распознавания можно выбрать: добавить в расход, добавить в доход, кредитку или пропуск.'));
    bot.on('photo', async (ctx) => this.onPhoto(ctx));
    bot.on('document', async (ctx) => this.onDocument(ctx));
    bot.on('text', async (ctx) => this.onText(ctx));

    bot.action(/^confirm:(.+)$/, async (ctx) => this.onConfirm(ctx, ctx.match[1]));
    bot.action(/^force:(.+)$/, async (ctx) => this.onConfirm(ctx, ctx.match[1], true));
    bot.action(/^income:(.+)$/, async (ctx) => this.onConfirmIncome(ctx, ctx.match[1]));
    bot.action(/^skip:(.+)$/, async (ctx) => this.onSkip(ctx, ctx.match[1]));
    bot.action(/^cancel:(.+)$/, async (ctx) => this.onCancel(ctx));
    bot.action(/^pc:(.+)$/, async (ctx) => this.onPickCategory(ctx, this.decodeId(ctx.match[1])));
    bot.action(/^pp:(.+)$/, async (ctx) => this.onPickPortfolio(ctx, this.decodeId(ctx.match[1])));
    bot.action(/^cc:(.+)$/, async (ctx) => this.onPickCreditCard(ctx, this.decodeId(ctx.match[1])));
    bot.action(/^sc:([^:]+):(.+)$/, async (ctx) => this.onSetCategory(ctx, this.decodeId(ctx.match[1]), this.decodeId(ctx.match[2])));
    bot.action(/^sp:([^:]+):(.+)$/, async (ctx) => this.onSetPortfolio(ctx, this.decodeId(ctx.match[1]), this.decodeId(ctx.match[2])));
    bot.action(/^setcc:([^:]+):(.+)$/, async (ctx) => this.onSetCreditCard(ctx, this.decodeId(ctx.match[1]), this.decodeId(ctx.match[2])));
  }

  private async onText(ctx: any) {
    const user = await this.userByTelegram(String(ctx.from.id));
    if (!user) return ctx.reply('Сначала привяжите аккаунт через приложение.');
    const text: string = ctx.message.text;
    if (text.startsWith('/')) return;
    const portfolioId = await this.defaultPortfolioId(user.id);
    if (!portfolioId) return ctx.reply('У вас нет доступных портфелей. Создайте портфель в приложении.');
    await ctx.reply('🔎 Анализирую…');
    const draft = await this.ai.recognizeText({ text, userId: user.id, portfolioId });
    await this.presentDraft(ctx, draft);
  }

  private async onPhoto(ctx: any) {
    const user = await this.userByTelegram(String(ctx.from.id));
    if (!user) return ctx.reply('Сначала привяжите аккаунт через приложение.');
    const portfolioId = await this.defaultPortfolioId(user.id);
    if (!portfolioId) return ctx.reply('У вас нет доступных портфелей. Создайте портфель в приложении.');
    await ctx.reply('🔎 Распознаю скриншот. Если там несколько операций — попробую найти все…');
    try {
      const photos = ctx.message.photo;
      const fileId = photos[photos.length - 1].file_id;
      const buffer = await this.downloadTelegramFile(ctx, fileId);
      const drafts = await this.ai.importOperations({ fileBase64: buffer.toString('base64'), mimeType: 'image/jpeg', filename: 'telegram-photo.jpg', userId: user.id, portfolioId });
      if (!drafts.length) return ctx.reply('Не нашёл явных операций на изображении. Попробуйте более чёткий скрин.');
      if (drafts.length > 1) await ctx.reply(`Нашёл операций: ${drafts.length}. Отправляю на подтверждение по одной.`);
      for (const draft of drafts) await this.presentDraft(ctx, draft);
    } catch (e) {
      this.logger.error(`Ошибка распознавания фото: ${(e as Error).message}`, (e as Error).stack);
      await ctx.reply('Не удалось распознать изображение. Напишите операцию текстом.');
    }
  }

  private async onDocument(ctx: any) {
    const user = await this.userByTelegram(String(ctx.from.id));
    if (!user) return ctx.reply('Сначала привяжите аккаунт через приложение.');
    const doc = ctx.message.document;
    const filename = doc.file_name ?? 'statement.pdf';
    const mimeType = doc.mime_type ?? '';
    const isPdf = mimeType.includes('pdf') || filename.toLowerCase().endsWith('.pdf');
    if (!isPdf) return ctx.reply('Пока я умею читать только PDF-выписки. Пришлите PDF-файл или фото чека.');
    const portfolioId = await this.defaultPortfolioId(user.id);
    if (!portfolioId) return ctx.reply('У вас нет доступных портфелей. Создайте портфель в приложении.');
    await ctx.reply('📄 Читаю PDF-выписку. Это может занять до минуты…');
    try {
      const buffer = await this.downloadTelegramFile(ctx, doc.file_id);
      const drafts = await this.ai.recognizePdfStatement({ buffer, filename, userId: user.id, portfolioId });
      if (!drafts.length) return ctx.reply('Не нашёл явных операций в PDF.');
      await ctx.reply(`Нашёл операций: ${drafts.length}. Отправляю их на подтверждение по одной.`);
      for (const draft of drafts) await this.presentDraft(ctx, draft);
    } catch (e) {
      this.logger.error(`Ошибка разбора PDF: ${(e as Error).message}`, (e as Error).stack);
      await ctx.reply(`Не удалось прочитать PDF: ${(e as Error).message}`);
    }
  }

  private async presentDraft(ctx: any, draft: RecognitionDraft) {
    this.sessions.set(String(ctx.from.id), { draft });
    await this.ensureLogType(draft.logId, draft.parsed.type);
    if (draft.status === ExpenseStatus.NEEDS_CLARIFICATION && !draft.parsed.amount) {
      await ctx.reply(draft.parsed.clarificationQuestion ?? 'Не смог распознать сумму. Опишите операцию текстом.');
      return;
    }
    await this.safeReply(ctx, await this.draftText(draft), this.draftKeyboard(draft));
  }

  private async draftText(draft: RecognitionDraft) {
    const p = draft.parsed;
    const portfolio = draft.portfolioId ? await this.prisma.portfolio.findUnique({ where: { id: draft.portfolioId } }) : null;
    const lines = [
      p.type === 'income' ? 'Нашёл доход:\n' : p.type === 'transfer' ? 'Нашёл перевод/операцию:\n' : draft.duplicateOf ? '⚠️ Похожий расход уже есть. Всё равно добавить?\n' : 'Нашёл расход:\n',
      `Сумма: ${p.amount ? `${this.fmt(p.amount)} ${p.currency}` : '—'}`,
      `Тип: ${this.typeLabel(p.type)}`,
      `Категория: ${draft.resolvedCategoryName ?? p.category ?? 'Другое'}`,
      `Описание: ${p.merchant ?? p.description ?? '—'}`,
      `Портфель: ${portfolio?.name ?? '—'}`,
      `Дата: ${p.date ?? new Date().toISOString().slice(0, 10)}`,
      `Уверенность: ${p.confidence}%`,
    ];
    if (draft.status === ExpenseStatus.NEEDS_CLARIFICATION) lines.push('\n❓ Не уверен в данных — проверьте перед добавлением.');
    return lines.join('\n');
  }

  private draftKeyboard(draft: RecognitionDraft) {
    const p = draft.parsed;
    const logId = draft.logId;
    const shortLogId = this.encodeId(logId);
    const rows: any[] = [];
    const expenseButton = Markup.button.callback(draft.duplicateOf ? '💸 Добавить в расход всё равно' : '💸 Добавить в расход', draft.duplicateOf ? `force:${logId}` : `confirm:${logId}`);
    const incomeButton = Markup.button.callback('💰 Добавить в доход', `income:${logId}`);

    if (p.type === 'income') {
      rows.push([incomeButton]);
      rows.push([expenseButton]);
    } else {
      rows.push([expenseButton]);
      rows.push([incomeButton]);
      rows.push([Markup.button.callback('💳 Добавить в кредитку', `cc:${shortLogId}`)]);
      if (p.type === 'transfer' || p.type === 'unknown') rows.push([Markup.button.callback('⏭ Пропустить', `skip:${logId}`)]);
    }
    rows.push([Markup.button.callback('🏷 Изменить категорию', `pc:${shortLogId}`)]);
    rows.push([Markup.button.callback('📁 Изменить портфель', `pp:${shortLogId}`)]);
    rows.push([Markup.button.callback('❌ Отмена', `cancel:${logId}`)]);
    return Markup.inlineKeyboard(rows);
  }

  private async onConfirm(ctx: any, logId: string, force = false) {
    const user = await this.userByTelegram(String(ctx.from!.id));
    await this.safeAnswer(ctx, 'Добавляю расход…');
    if (!user) return this.safeReply(ctx, 'Аккаунт не привязан.');
    try {
      const res = await this.ai.confirmRecognition({ logId, userId: user.id, force });
      this.sessions.delete(String(ctx.from!.id));
      await this.safeEditOrReply(ctx, res.alreadyCreated ? '✅ Эта операция уже была добавлена ранее.' : '✅ Расход добавлен.');
    } catch (e) {
      this.logger.error(`Не удалось подтвердить расход: ${(e as Error).message}`, (e as Error).stack);
      await this.safeReply(ctx, `Не удалось добавить расход: ${(e as Error).message}`);
    }
  }

  private async onConfirmIncome(ctx: any, logId: string) {
    const user = await this.userByTelegram(String(ctx.from!.id));
    await this.safeAnswer(ctx, 'Добавляю доход…');
    if (!user) return this.safeReply(ctx, 'Аккаунт не привязан.');
    try {
      await this.ai.confirmImportedOperations({ userId: user.id, operations: [{ logId, action: 'income' }] });
      this.sessions.delete(String(ctx.from!.id));
      await this.safeEditOrReply(ctx, '✅ Доход добавлен.');
    } catch (e) {
      this.logger.error(`Не удалось подтвердить доход: ${(e as Error).message}`, (e as Error).stack);
      await this.safeReply(ctx, `Не удалось добавить доход: ${(e as Error).message}`);
    }
  }

  private async onSkip(ctx: any, logId: string) {
    const user = await this.userByTelegram(String(ctx.from!.id));
    await this.safeAnswer(ctx, 'Пропускаю…');
    if (!user) return this.safeReply(ctx, 'Аккаунт не привязан.');
    try {
      await this.ai.confirmImportedOperations({ userId: user.id, operations: [{ logId, action: 'skip' }] });
      this.sessions.delete(String(ctx.from!.id));
      await this.safeEditOrReply(ctx, '⏭ Операция пропущена.');
    } catch (e) {
      await this.safeReply(ctx, `Не удалось пропустить: ${(e as Error).message}`);
    }
  }

  private async onCancel(ctx: any) {
    this.sessions.delete(String(ctx.from!.id));
    await this.safeAnswer(ctx, 'Отменено');
    await this.safeEditOrReply(ctx, '❌ Операция не добавлена.');
  }

  private async onPickCreditCard(ctx: any, logId: string) {
    const user = await this.userByTelegram(String(ctx.from!.id));
    await this.safeAnswer(ctx, 'Открываю кредитки…');
    if (!user) return this.safeReply(ctx, 'Аккаунт не привязан.');
    try {
      const log = await this.prisma.aiRecognitionLog.findUnique({ where: { id: logId } });
      const portfolioId = log?.portfolioId ?? await this.defaultPortfolioId(user.id);
      if (!portfolioId) return this.safeReply(ctx, 'Не найден портфель для операции.');
      const cards = await this.creditCards.list(portfolioId, user.id);
      if (!cards.length) return this.safeReply(ctx, 'В разделе «Кредитки» ещё нет карт. Создайте карту в приложении и отправьте скрин ещё раз.');
      const shortLogId = this.encodeId(logId);
      const buttons = cards.map((card: any) => [Markup.button.callback(card.title, `setcc:${shortLogId}:${this.encodeId(card.id)}`)]);
      await this.safeReply(ctx, 'Выберите кредитку, куда добавить покупку:', Markup.inlineKeyboard(buttons));
    } catch (e) {
      this.logger.error(`Ошибка выбора кредитки: ${(e as Error).message}`, (e as Error).stack);
      await this.safeReply(ctx, 'Не удалось открыть список кредиток. Попробуйте ещё раз.');
    }
  }

  private async onSetCreditCard(ctx: any, logId: string, cardId: string) {
    const user = await this.userByTelegram(String(ctx.from!.id));
    await this.safeAnswer(ctx, 'Добавляю в кредитку…');
    if (!user) return this.safeReply(ctx, 'Аккаунт не привязан.');
    try {
      const charge = await this.creditCards.createChargeFromAi(cardId, user.id, logId);
      this.sessions.delete(String(ctx.from!.id));
      await this.safeEditOrReply(ctx, `✅ Покупка добавлена в кредитку: ${charge.title} — ${this.fmt(charge.amount)} ₽`);
    } catch (e) {
      this.logger.error(`Не удалось добавить в кредитку: ${(e as Error).message}`, (e as Error).stack);
      await this.safeReply(ctx, `Не удалось добавить в кредитку: ${(e as Error).message}`);
    }
  }

  private async onPickCategory(ctx: any, logId: string) {
    await this.safeAnswer(ctx, 'Открываю категории…');
    try {
      const log = await this.prisma.aiRecognitionLog.findUnique({ where: { id: logId } });
      if (!log?.portfolioId) return this.safeReply(ctx, 'Сессия устарела. Отправьте операцию ещё раз.');
      const cats = await this.prisma.category.findMany({ where: { isActive: true, OR: [{ portfolioId: null, isSystem: true }, { portfolioId: log.portfolioId }] }, orderBy: { name: 'asc' }, take: 50 });
      const shortLogId = this.encodeId(logId);
      const buttons = cats.map((c) => [Markup.button.callback(c.name, `sc:${shortLogId}:${this.encodeId(c.id)}`)]);
      await this.safeReply(ctx, 'Выберите категорию:', Markup.inlineKeyboard(buttons));
    } catch (e) {
      await this.safeReply(ctx, 'Не удалось открыть список категорий.');
    }
  }

  private async onSetCategory(ctx: any, logId: string, categoryId: string) {
    const user = await this.userByTelegram(String(ctx.from!.id));
    await this.safeAnswer(ctx, 'Категория обновляется…');
    if (!user) return this.safeReply(ctx, 'Аккаунт не привязан.');
    const log = await this.prisma.aiRecognitionLog.findUnique({ where: { id: logId } });
    if (!log?.portfolioId) return this.safeReply(ctx, 'Сессия устарела. Отправьте операцию ещё раз.');
    const cat = await this.prisma.category.findFirst({ where: { id: categoryId, isActive: true, OR: [{ portfolioId: null, isSystem: true }, { portfolioId: log.portfolioId }] } });
    if (!cat) return this.safeReply(ctx, 'Категория недоступна.');
    await this.prisma.aiRecognitionLog.update({ where: { id: logId }, data: { parsedCategoryId: categoryId } });
    const draft = await this.draftFromLog(logId);
    await this.safeReply(ctx, `✅ Категория изменена: ${cat.name}`);
    if (draft) await this.presentDraft(ctx, draft);
  }

  private async onPickPortfolio(ctx: any, logId: string) {
    const user = await this.userByTelegram(String(ctx.from!.id));
    await this.safeAnswer(ctx, 'Открываю портфели…');
    if (!user) return this.safeReply(ctx, 'Аккаунт не привязан.');
    const portfolios = await this.userPortfolios(user.id);
    if (!portfolios.length) return this.safeReply(ctx, 'У вас нет доступных портфелей.');
    if (portfolios.length === 1) return this.onSetPortfolio(ctx, logId, portfolios[0].id);
    const shortLogId = this.encodeId(logId);
    const buttons = portfolios.map((p) => [Markup.button.callback(p.name, `sp:${shortLogId}:${this.encodeId(p.id)}`)]);
    await this.safeReply(ctx, 'Выберите портфель:', Markup.inlineKeyboard(buttons));
  }

  private async onSetPortfolio(ctx: any, logId: string, portfolioId: string) {
    const user = await this.userByTelegram(String(ctx.from!.id));
    await this.safeAnswer(ctx, 'Обновляю…');
    if (!user) return this.safeReply(ctx, 'Аккаунт не привязан.');
    const portfolio = await this.prisma.portfolio.findFirst({ where: { id: portfolioId, members: { some: { userId: user.id, status: 'ACTIVE' } } } });
    if (!portfolio) return this.safeReply(ctx, 'Портфель недоступен.');
    const log = await this.prisma.aiRecognitionLog.findUnique({ where: { id: logId } });
    const sessionDraft = this.sessions.get(String(ctx.from!.id))?.draft;
    const type = sessionDraft?.logId === logId ? sessionDraft.parsed.type : this.operationTypeFromLog(log);
    const parsedCategoryId = await this.categoryIdForPortfolio(log?.parsedCategoryId ?? null, portfolioId);
    await this.prisma.aiRecognitionLog.update({ where: { id: logId }, data: { portfolioId, parsedCategoryId, errorMessage: this.logMetaString({ type }) } });
    const draft = await this.draftFromLog(logId);
    await this.safeReply(ctx, `✅ Портфель изменён: ${portfolio.name}`);
    if (draft) await this.presentDraft(ctx, draft);
  }

  private async draftFromLog(logId: string): Promise<RecognitionDraft | null> {
    const log = await this.prisma.aiRecognitionLog.findUnique({ where: { id: logId } });
    if (!log?.portfolioId) return null;
    const cat = log.parsedCategoryId ? await this.prisma.category.findUnique({ where: { id: log.parsedCategoryId } }) : null;
    const amount = log.parsedAmount == null ? null : Number(log.parsedAmount);
    const type = this.operationTypeFromLog(log);
    return {
      logId: log.id,
      portfolioId: log.portfolioId,
      parsed: {
        type,
        amount,
        currency: 'RUB',
        date: log.parsedDate ? log.parsedDate.toISOString().slice(0, 10) : null,
        merchant: log.parsedMerchant,
        description: log.parsedMerchant ?? log.extractedText,
        category: cat?.name ?? null,
        confidence: log.confidence ?? 0,
        needsClarification: log.status !== 'CONFIRMED',
        clarificationQuestion: null,
        extractedText: log.extractedText,
      },
      resolvedCategoryId: log.parsedCategoryId,
      resolvedCategoryName: cat?.name ?? null,
      status: log.status === 'CONFIRMED' ? ExpenseStatus.CONFIRMED : ExpenseStatus.NEEDS_CLARIFICATION,
      screenshotUrl: log.originalFileUrl,
      duplicateOf: null,
    };
  }

  private async categoryIdForPortfolio(currentCategoryId: string | null, portfolioId: string): Promise<string | null> {
    if (currentCategoryId) {
      const current = await this.prisma.category.findUnique({ where: { id: currentCategoryId } });
      if (current) {
        const sameName = await this.prisma.category.findFirst({ where: { name: { equals: current.name, mode: 'insensitive' }, isActive: true, OR: [{ portfolioId }, { portfolioId: null, isSystem: true }] } });
        if (sameName) return sameName.id;
      }
    }
    const fallback = await this.prisma.category.findFirst({ where: { name: { equals: 'Другое', mode: 'insensitive' }, isActive: true, OR: [{ portfolioId }, { portfolioId: null, isSystem: true }] } });
    return fallback?.id ?? null;
  }

  private async downloadTelegramFile(ctx: any, fileId: string): Promise<Buffer> {
    const link = await ctx.telegram.getFileLink(fileId);
    const resp = await fetch(link.href);
    if (!resp.ok) throw new Error(`Не удалось скачать файл Telegram: ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  }

  private async safeAnswer(ctx: any, text?: string) {
    try { await ctx.answerCbQuery(text); } catch (e) { this.logger.warn(`answerCbQuery failed: ${(e as Error).message}`); }
  }

  private async safeReply(ctx: any, text: string, extra?: any) {
    try { await ctx.reply(text, extra); } catch (e) { this.logger.warn(`reply failed: ${(e as Error).message}`); }
  }

  private async safeEditOrReply(ctx: any, text: string) {
    try { await ctx.editMessageText(text); } catch { await this.safeReply(ctx, text); }
  }

  private async userByTelegram(telegramId: string) {
    return this.prisma.user.findUnique({ where: { telegramId } });
  }

  private async userPortfolios(userId: string) {
    return this.prisma.portfolio.findMany({ where: { members: { some: { userId, status: 'ACTIVE' } } }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }, { createdAt: 'asc' }] });
  }

  private async defaultPortfolioId(userId: string): Promise<string | null> {
    const portfolios = await this.userPortfolios(userId);
    return portfolios[0]?.id ?? null;
  }

  private async ensureLogType(logId: string, type?: string) {
    if (!type) return;
    const log = await this.prisma.aiRecognitionLog.findUnique({ where: { id: logId }, select: { errorMessage: true } });
    const meta = this.parseLogMeta(log?.errorMessage);
    if (meta.type) return;
    const normalized = this.normalizeOperationType(type);
    await this.prisma.aiRecognitionLog.update({ where: { id: logId }, data: { errorMessage: this.logMetaString({ ...meta, type: normalized }) } });
  }

  private operationTypeFromLog(log: any): OperationType {
    const meta = this.parseLogMeta(log?.errorMessage);
    if (meta.type) return meta.type;
    const text = [log?.extractedText, log?.parsedMerchant].filter(Boolean).join('\n');
    const amountDigits = log?.parsedAmount == null ? null : String(Math.round(Math.abs(Number(log.parsedAmount)))).replace(/\D/g, '');
    const matches = Array.from(text.matchAll(/([+＋−–—-])\s*([0-9][0-9\s.,]*)\s*(?:₽|руб\.?|р\b)?/gi));
    for (const match of matches) {
      const sign = match[1];
      const digits = match[2].replace(/\D/g, '');
      if (amountDigits && digits && !digits.includes(amountDigits) && !amountDigits.includes(digits)) continue;
      return sign === '+' || sign === '＋' ? 'income' : 'expense';
    }
    const lowered = text.toLowerCase();
    if (/\b(поступление|зачисление|пополнение|перевод от|вам перевели|получен перевод|приход|зарплата|заработная плата|работодатель)\b/i.test(lowered)) return 'income';
    if (/\b(списание|оплата|покупка|перевод\s+кому|плат[её]ж|расход)\b/i.test(lowered)) return 'expense';
    return 'expense';
  }

  private normalizeOperationType(value: string | undefined): OperationType {
    return value === 'income' || value === 'transfer' || value === 'unknown' ? value : 'expense';
  }

  private parseLogMeta(value?: string | null): { type?: OperationType } {
    if (!value?.startsWith('ff:')) return {};
    const type = value.match(/type=(income|expense|transfer|unknown)/)?.[1] as OperationType | undefined;
    return { type };
  }

  private logMetaString(meta: { type?: string }) {
    return `ff:type=${meta.type ?? 'expense'}`;
  }

  private encodeId(id: string): string {
    const uuid = id.toLowerCase();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)) return Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url');
    return id;
  }

  private decodeId(value: string): string {
    try {
      const hex = Buffer.from(value, 'base64url').toString('hex');
      if (/^[0-9a-f]{32}$/.test(hex)) return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {}
    return value;
  }

  private typeLabel(type: string | undefined): string {
    if (type === 'income') return 'доход';
    if (type === 'transfer') return 'перевод';
    if (type === 'unknown') return 'неясно';
    return 'расход';
  }

  private fmt(n: number): string {
    return new Intl.NumberFormat('ru-RU').format(n);
  }
}
