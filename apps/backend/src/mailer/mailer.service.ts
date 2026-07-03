import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * Отправка email (§15, §5.3). Если задан SMTP_HOST — реальная отправка через SMTP,
 * иначе console-драйвер (письма пишутся в лог) — удобно для разработки.
 * Провайдера легко заменить (SendGrid/Postmark/SES) внутри этого сервиса.
 */
@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transport: nodemailer.Transporter | null = null;
  private readonly from = process.env.MAIL_FROM ?? 'Family Finance <no-reply@familyfinance.app>';

  onModuleInit() {
    if (process.env.SMTP_HOST) {
      this.transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
      this.logger.log(`SMTP-почта включена (${process.env.SMTP_HOST})`);
    } else {
      this.logger.warn('SMTP не настроен — письма выводятся в лог (console-драйвер)');
    }
  }

  isConfigured() {
    return Boolean(this.transport);
  }

  async send(to: string, subject: string, text: string, html?: string) {
    if (!this.transport) {
      this.logger.log(`[EMAIL → ${to}] ${subject}\n${text}`);
      return { delivered: false, mode: 'console' };
    }
    try {
      await this.transport.sendMail({ from: this.from, to, subject, text, html });
      return { delivered: true, mode: 'smtp' };
    } catch (e) {
      this.logger.error(`Не удалось отправить письмо на ${to}: ${(e as Error).message}`);
      return { delivered: false, mode: 'error', error: (e as Error).message };
    }
  }

  async sendPasswordResetCode(to: string, code: string) {
    return this.send(
      to,
      'Восстановление пароля — Family Finance',
      `Ваш код для восстановления пароля: ${code}\nКод действует 15 минут. Если вы не запрашивали восстановление, проигнорируйте письмо.`,
      `<p>Ваш код для восстановления пароля:</p><h2 style="letter-spacing:3px">${code}</h2><p>Код действует 15 минут.</p>`,
    );
  }

  async sendInvitation(to: string, inviterName: string, url: string) {
    return this.send(
      to,
      `${inviterName} приглашает вас в Family Finance`,
      `${inviterName} пригласил вас в общий финансовый портфель. Перейдите по ссылке, чтобы присоединиться: ${url}`,
      `<p><b>${inviterName}</b> приглашает вас в общий финансовый портфель.</p><p><a href="${url}">Присоединиться</a></p>`,
    );
  }
}
