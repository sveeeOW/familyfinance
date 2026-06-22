import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreditStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { PushService } from './push.service';

/**
 * Уведомления (§15) и напоминания о платежах (§12.3).
 * Каналы: Telegram + push (Expo). Email — через MailerService там, где уместно.
 * Ежедневный cron в 9:00 проверяет ближайшие платежи и шлёт напоминания
 * за reminderDays (по умолчанию 7/3/1/0 дней до платежа).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly push: PushService,
  ) {}

  /** Универсальная отправка пользователю по всем доступным каналам. */
  async notifyUser(userId: string, title: string, body: string, data?: Record<string, unknown>) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });
    await this.push.sendToUser(userId, title, body, data);
    if (user?.telegramId) {
      await this.telegram.sendMessage(user.telegramId, `${title}\n${body}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendPaymentReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const credits = await this.prisma.credit.findMany({
      where: { status: CreditStatus.ACTIVE },
    });
    for (const credit of credits) {
      const daysLeft = this.daysUntil(credit.paymentDay, today);
      if (credit.userId && credit.reminderDays.includes(daysLeft)) {
        await this.notifyUser(
          credit.userId,
          '🔔 Платёж по кредиту',
          this.reminderText(credit.title, Number(credit.monthlyPayment), daysLeft),
          { type: 'credit', creditId: credit.id },
        );
      }
    }

    const recurring = await this.prisma.recurringPayment.findMany({
      where: { status: CreditStatus.ACTIVE },
    });
    for (const payment of recurring) {
      const daysLeft = this.daysUntil(payment.paymentDay, today);
      if (payment.userId && payment.reminderDays.includes(daysLeft)) {
        await this.notifyUser(
          payment.userId,
          '🔔 Обязательный платёж',
          this.reminderText(payment.title, Number(payment.amount), daysLeft),
          { type: 'recurring', paymentId: payment.id },
        );
      }
    }
    this.logger.log('Проверка напоминаний о платежах выполнена');
  }

  /** Количество дней от сегодня до ближайшего дня платежа в месяце. */
  private daysUntil(paymentDay: number, today: Date): number {
    const next = new Date(today.getFullYear(), today.getMonth(), paymentDay);
    if (next < today) next.setMonth(next.getMonth() + 1);
    return Math.round((next.getTime() - today.getTime()) / (24 * 3600 * 1000));
  }

  private reminderText(title: string, amount: number, days: number): string {
    const when = days === 0 ? 'сегодня' : `через ${days} дн.`;
    return `«${title}» ${when}: ${new Intl.NumberFormat('ru-RU').format(amount)} ₽.`;
  }
}
