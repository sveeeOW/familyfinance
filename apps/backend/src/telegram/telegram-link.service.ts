import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TelegramLinkService {
  constructor(private readonly prisma: PrismaService) {}

  /** Генерирует код привязки и deep-link на бота (§10.2). */
  async generateLinkCode(userId: string) {
    const code = nanoid(8);
    await this.prisma.telegramLinkToken.create({
      data: { userId, code, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });
    const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? 'familyfinanceapp_bot';
    return {
      code,
      deepLink: `https://t.me/${botUsername}?start=${code}`,
      expiresInMinutes: 30,
    };
  }

  /** Привязывает Telegram ID к аккаунту по коду. */
  async linkByCode(code: string, telegramId: string): Promise<{ ok: boolean; reason?: string }> {
    const token = await this.prisma.telegramLinkToken.findUnique({ where: { code } });
    if (!token || token.usedAt || token.expiresAt < new Date()) {
      return { ok: false, reason: 'Код недействителен или истёк' };
    }
    // Если этот telegramId уже привязан к другому — освобождаем.
    await this.prisma.user.updateMany({
      where: { telegramId, id: { not: token.userId } },
      data: { telegramId: null },
    });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: token.userId }, data: { telegramId } }),
      this.prisma.telegramLinkToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    ]);
    return { ok: true };
  }
}
