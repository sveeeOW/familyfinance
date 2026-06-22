import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseScope, SplitType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class ShareInputDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ description: 'процент доли (для PERCENT)' })
  @IsOptional()
  @IsNumber()
  percent?: number;

  @ApiPropertyOptional({ description: 'фиксированная сумма доли (для SHARES)' })
  @IsOptional()
  @IsNumber()
  amount?: number;
}

export class CreateExpenseDto {
  @ApiProperty()
  @IsUUID()
  portfolioId: string;

  @ApiProperty({ example: 8000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'RUB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: '2026-06-22' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ description: 'id категории' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'продавец/получатель' })
  @IsOptional()
  @IsString()
  merchant?: string;

  @ApiPropertyOptional({ description: 'кто оплатил (по умолчанию — текущий пользователь)' })
  @IsOptional()
  @IsUUID()
  paidByUserId?: string;

  @ApiPropertyOptional({ enum: ExpenseScope, default: ExpenseScope.SHARED })
  @IsOptional()
  @IsEnum(ExpenseScope)
  scope?: ExpenseScope;

  @ApiPropertyOptional({ enum: SplitType, default: SplitType.NONE })
  @IsOptional()
  @IsEnum(SplitType)
  splitType?: SplitType;

  @ApiPropertyOptional({ type: [ShareInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShareInputDto)
  shares?: ShareInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  screenshotUrl?: string;
}

export class UpdateExpenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ExpenseScope })
  @IsOptional()
  @IsEnum(ExpenseScope)
  scope?: ExpenseScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ClarifyExpenseDto {
  @ApiPropertyOptional({ description: 'выбранная пользователем категория' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'текстовое пояснение пользователя' })
  @IsOptional()
  @IsString()
  comment?: string;
}
