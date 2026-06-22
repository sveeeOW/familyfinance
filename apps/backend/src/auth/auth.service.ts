import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { MailerService } from '../mailer/mailer.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly categories: CategoriesService,
    private readonly mailer: MailerService,
  ) {}

  // ─── Регистрация (§5.1) ───────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Нужно указать email или телефон');
    }
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          dto.email ? { email: dto.email } : undefined,
          dto.phone ? { phone: dto.phone } : undefined,
        ].filter(Boolean) as any,
      },
    });
    if (existing) {
      throw new ConflictException('Пользователь с таким email или телефоном уже существует');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        defaultCurrency: dto.defaultCurrency ?? 'RUB',
        timezone: dto.timezone ?? 'Europe/Moscow',
      },
    });

    // Каждому новому пользователю создаём личный портфель по умолчанию.
    const portfolio = await this.prisma.portfolio.create({
      data: {
        name: 'Личный портфель',
        type: 'PERSONAL',
        ownerUserId: user.id,
        currency: user.defaultCurrency,
        isDefault: true,
        members: {
          create: { userId: user.id, role: 'OWNER', accessLevel: 'FULL', status: 'ACTIVE' },
        },
      },
    });
    await this.categories.ensurePortfolioCategories(portfolio.id);

    return this.issueTokens(user.id, user.email);
  }

  // ─── Вход (§5.2) ──────────────────────────────────────────────────────────
  async login(dto: LoginDto) {
    const user = await this.findByLogin(dto.login);
    if (!user) throw new UnauthorizedException('Неверный логин или пароль');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Неверный логин или пароль');

    return this.issueTokens(user.id, user.email);
  }

  // ─── Refresh (§5.4) ───────────────────────────────────────────────────────
  async refresh(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Недействительный refresh-токен');
    }

    const tokenHash = this.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revokedAt: null },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Сессия истекла, войдите заново');
    }

    // Ротация: отзываем использованный refresh-токен.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();
    return this.issueTokens(user.id, user.email);
  }

  // ─── Выход (§5.4) ─────────────────────────────────────────────────────────
  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash: this.hash(refreshToken) },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  }

  // ─── Восстановление пароля (§5.3) ─────────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.findByLogin(dto.login);
    // Не раскрываем, существует ли аккаунт.
    if (user) {
      const code = ('' + Math.floor(100000 + Math.random() * 900000)); // 6 цифр
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          codeHash: this.hash(code),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
      // Отправляем код по email (если логин — email). Для телефона нужен SMS-провайдер.
      if (user.email && dto.login.includes('@')) {
        await this.mailer.sendPasswordResetCode(user.email, code);
      } else {
        this.logger.log(`Код восстановления для ${dto.login}: ${code} (SMS-провайдер не настроен)`);
      }
    }
    return { success: true, message: 'Если аккаунт существует, код отправлен' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.findByLogin(dto.login);
    if (!user) throw new BadRequestException('Неверный код или логин');

    const token = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, codeHash: this.hash(dto.code), usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.expiresAt < new Date()) {
      throw new BadRequestException('Код недействителен или истёк');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      // Сбрасываем все активные сессии.
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private async findByLogin(login: string) {
    return this.prisma.user.findFirst({
      where: { OR: [{ email: login }, { phone: login }] },
    });
  }

  private async issueTokens(userId: string, email?: string | null) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: Number(process.env.JWT_REFRESH_TTL ?? 2592000),
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + Number(process.env.JWT_REFRESH_TTL ?? 2592000) * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900),
    };
  }

  private hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
