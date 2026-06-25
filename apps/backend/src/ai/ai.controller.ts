import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import {
  ConfirmImportOperationsDto,
  ConfirmRecognitionDto,
  ImportOperationsDto,
  RecognizeImageDto,
  RecognizeTextDto,
  UpdateCategoryRuleDto,
} from './dto/ai.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('provider-status')
  providerStatus() {
    return this.ai.getProviderStatus();
  }

  @Post('recognize-expense')
  async recognize(@CurrentUser('userId') userId: string, @Body() dto: RecognizeImageDto & RecognizeTextDto) {
    if (dto.imageBase64) {
      const buffer = Buffer.from(dto.imageBase64, 'base64');
      return this.ai.recognizeImage({
        buffer,
        mimeType: dto.mimeType ?? 'image/jpeg',
        userId,
        portfolioId: dto.portfolioId,
        source: 'MOBILE_OCR',
      });
    }
    if (dto.text) {
      return this.ai.recognizeText({ text: dto.text, userId, portfolioId: dto.portfolioId });
    }
    throw new BadRequestException('Передайте text или imageBase64');
  }

  @Post('import-operations')
  async importOperations(@CurrentUser('userId') userId: string, @Body() dto: ImportOperationsDto) {
    return this.ai.importOperations({
      userId,
      portfolioId: dto.portfolioId,
      fileBase64: dto.fileBase64,
      mimeType: dto.mimeType,
      filename: dto.filename,
      text: dto.text,
    });
  }

  @Post('confirm-import-operations')
  confirmImportOperations(@CurrentUser('userId') userId: string, @Body() dto: ConfirmImportOperationsDto) {
    return this.ai.confirmImportedOperations({ userId, operations: dto.operations ?? [] });
  }

  @Post('confirm-expense')
  confirm(@CurrentUser('userId') userId: string, @Body() dto: ConfirmRecognitionDto) {
    return this.ai.confirmRecognition({
      logId: dto.logId,
      userId,
      categoryId: dto.categoryId,
      portfolioId: dto.portfolioId,
      force: dto.force,
    });
  }

  @Post('update-category-rule')
  updateRule(@CurrentUser('userId') userId: string, @Body() dto: UpdateCategoryRuleDto) {
    return this.ai.updateCategoryRule({
      userId,
      portfolioId: dto.portfolioId,
      merchant: dto.merchant,
      categoryId: dto.categoryId,
    });
  }
}
