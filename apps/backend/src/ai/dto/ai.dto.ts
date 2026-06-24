import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

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

export class ImportOperationsDto {
  @ApiProperty()
  @IsUUID()
  portfolioId: string;

  @ApiPropertyOptional({ description: 'изображение или PDF в base64' })
  @IsOptional()
  @IsString()
  fileBase64?: string;

  @ApiPropertyOptional({ example: 'image/jpeg или application/pdf' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ example: 'receipt.pdf' })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiPropertyOptional({ description: 'сырой текст операции/выписки' })
  @IsOptional()
  @IsString()
  text?: string;
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

export class ConfirmImportedOperationDto {
  @ApiProperty()
  @IsUUID()
  logId: string;

  @ApiProperty({ enum: ['expense', 'income', 'skip'] })
  @IsIn(['expense', 'income', 'skip'])
  action: 'expense' | 'income' | 'skip';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ConfirmImportOperationsDto {
  @ApiProperty({ type: [ConfirmImportedOperationDto] })
  @IsArray()
  operations: ConfirmImportedOperationDto[];
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
