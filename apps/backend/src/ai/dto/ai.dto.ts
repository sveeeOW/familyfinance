import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecognizeTextDto {
  @ApiProperty()
  @IsUUID()
  portfolioId: string;

  @ApiProperty({ example: 'Потратил 2500 на продукты в Перекрёстке' })
  @IsString()
  text: string;
}

export class RecognizeImageDto {
  @ApiProperty()
  @IsUUID()
  portfolioId: string;

  @ApiProperty({ description: 'изображение в base64' })
  @IsString()
  imageBase64: string;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  mimeType?: string;
}

export class ConfirmRecognitionDto {
  @ApiProperty()
  @IsUUID()
  logId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  portfolioId?: string;

  @ApiPropertyOptional({ description: 'добавить, несмотря на возможный дубль' })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class UpdateCategoryRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  portfolioId?: string;

  @ApiProperty({ example: 'Ozon' })
  @IsString()
  merchant: string;

  @ApiProperty()
  @IsUUID()
  categoryId: string;
}
