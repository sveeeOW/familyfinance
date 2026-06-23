import { Controller, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';
import { TelegramLinkService } from './telegram-link.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly links: TelegramLinkService,
  ) {}

  /** Webhook от Telegram (§19.7). Без авторизации — вызывается серверами Telegram. */
  @Post('webhook')
  async webhook(@Req() req: any) {
    try {
      await this.telegram.handleUpdate(req.body);
    } catch (error) {
      // Telegram будет бесконечно повторять update, если вернуть 500.
      // Поэтому логируем ошибку, но всегда подтверждаем получение webhook.
      this.logger.error(`Telegram webhook error: ${(error as Error).message}`, (error as Error).stack);
    }
    return { ok: true, received: true };
  }

  /** Сгенерировать код привязки бота (Настройки → Telegram-бот, §10.2). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('link-code')
  linkCode(@CurrentUser('userId') userId: string) {
    return this.links.generateLinkCode(userId);
  }
}
