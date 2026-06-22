import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Push-уведомления через Expo Push Service (§15). Хранит токены устройств и
 * рассылает сообщения по всем устройствам пользователя. Невалидные токены
 * (DeviceNotRegistered) удаляются.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

  constructor(private readonly prisma: PrismaService) {}

  async registerToken(userId: string, token: string, platform?: string) {
    if (!Expo.isExpoPushToken(token)) {
      this.logger.warn(`Невалидный Expo push-токен от пользователя ${userId}`);
      return { success: false };
    }
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
    return { success: true };
  }

  async removeToken(token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
    return { success: true };
  }

  async sendToUser(userId: string, title: string, body: string, data?: Record<string, unknown>) {
    const devices = await this.prisma.deviceToken.findMany({ where: { userId } });
    if (devices.length === 0) return;

    const messages: ExpoPushMessage[] = devices
      .filter((d) => Expo.isExpoPushToken(d.token))
      .map((d) => ({ to: d.token, sound: 'default', title, body, data }));
    if (messages.length === 0) return;

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];
    for (const chunk of chunks) {
      try {
        const receipts = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...receipts);
      } catch (e) {
        this.logger.error(`Ошибка отправки push: ${(e as Error).message}`);
      }
    }

    // Чистим токены, которые Expo отклонил как недоступные.
    await Promise.all(
      tickets.map(async (ticket, i) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          const to = (messages[i].to as string) ?? '';
          await this.prisma.deviceToken.deleteMany({ where: { token: to } });
        }
      }),
    );
  }
}
