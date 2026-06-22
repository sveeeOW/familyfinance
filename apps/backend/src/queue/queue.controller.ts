import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QueueService } from './queue.service';
import { RecognizeImageDto } from '../ai/dto/ai.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  /**
   * Асинхронное распознавание чека (§20.2). Возвращает 202 сразу; результат
   * приходит пользователю уведомлением. Без Redis обрабатывается инлайн.
   */
  @Post('recognize-async')
  @HttpCode(202)
  recognizeAsync(@CurrentUser('userId') userId: string, @Body() dto: RecognizeImageDto) {
    return this.queue.enqueueReceipt({
      userId,
      portfolioId: dto.portfolioId,
      imageBase64: dto.imageBase64,
      mimeType: dto.mimeType ?? 'image/jpeg',
    });
  }
}
