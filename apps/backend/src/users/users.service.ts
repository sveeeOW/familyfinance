import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        telegramId: true,
        avatarUrl: true,
        defaultCurrency: true,
        timezone: true,
        locale: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.prisma.user.update({ where: { id: userId }, data: dto });
    return this.me(userId);
  }

  /** Удаление аккаунта (§5.4, §14.9). Каскад чистит связанные данные. */
  async deleteAccount(userId: string) {
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }
}
