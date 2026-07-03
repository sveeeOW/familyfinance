import { Body, Controller, Post } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';

type RequestBody = { login: string };
type CompleteBody = { login: string; code: string; newPassword: string };

@Controller('password-recovery')
export class RecoveryController {
  private schemaReady?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  @Post('request')
  async request(@Body() body: RequestBody) {
    await this.ensureSchema();
    const login = this.normalizeLogin(body.login ?? '');
    if (!login) return { success: false, message: 'Введите email или телефон аккаунта.' };

    const user = await this.prisma.user.findFirst({ where: { OR: [{ email: login }, { phone: login }] } });
    if (!user) return { success: true, message: 'Если аккаунт существует, код отправлен.' };
    if (!user.email) return { success: false, message: 'У аккаунта не указана почта. Обратитесь к владельцу приложения.' };
    if (!this.mailer.isConfigured()) {
      return { success: false, message: 'Почтовая отправка на сервере пока не настроена. Нужно подключить SMTP.' };
    }

    const code = String(crypto.randomInt(100000, 1000000));
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        codeHash: this.hash(code),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    const delivery = await this.mailer.sendPasswordResetCode(user.email, code);
    if (!delivery.delivered) return { success: false, message: 'Не удалось отправить письмо. Попробуйте позже.' };
    return { success: true, message: `Код отправлен на ${this.maskEmail(user.email)}.` };
  }

  @Post('complete')
  async complete(@Body() body: CompleteBody) {
    await this.ensureSchema();
    const login = this.normalizeLogin(body.login ?? '');
    const code = String(body.code ?? '').trim();
    const newPassword = String(body.newPassword ?? '');
    if (!login || !code) return { success: false, message: 'Введите логин и код.' };
    if (newPassword.length < 8) return { success: false, message: 'Новый пароль должен быть не короче 8 символов.' };

    const user = await this.prisma.user.findFirst({ where: { OR: [{ email: login }, { phone: login }] } });
    if (!user) return { success: false, message: 'Неверный код или логин.' };

    const token = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, codeHash: this.hash(code), usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.expiresAt < new Date()) return { success: false, message: 'Код недействителен или истёк.' };

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } }),
      this.prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { success: true, message: 'Пароль изменён. Теперь можно войти с новым паролем.' };
  }

  private ensureSchema() {
    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS password_reset_tokens (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, code_hash text NOT NULL, expires_at timestamp(3) NOT NULL, used_at timestamp(3), created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
        await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);');
      })();
    }
    return this.schemaReady;
  }

  private normalizeLogin(value: string) {
    const login = value.trim();
    return login.includes('@') ? login.toLowerCase() : login;
  }

  private maskEmail(email: string) {
    const [name, domain] = email.split('@');
    if (!domain) return email;
    return `${name.slice(0, 2)}***@${domain}`;
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
