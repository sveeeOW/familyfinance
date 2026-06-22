import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncomeType, Recurrence } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateIncomeDto {
  @ApiProperty()
  @IsUUID()
  portfolioId: string;

  @ApiProperty({ enum: IncomeType, example: IncomeType.SALARY })
  @IsEnum(IncomeType)
  type: IncomeType;

  @ApiProperty({ example: 225000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'RUB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: '2026-06-05' })
  @IsString()
  date: string;

  @ApiPropertyOptional({ enum: Recurrence, default: Recurrence.MONTHLY })
  @IsOptional()
  @IsEnum(Recurrence)
  recurrence?: Recurrence;

  @ApiPropertyOptional({ description: 'число месяца для регулярного дохода', minimum: 1, maximum: 31 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateIncomeDto {
  @ApiPropertyOptional({ enum: IncomeType })
  @IsOptional()
  @IsEnum(IncomeType)
  type?: IncomeType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ enum: Recurrence })
  @IsOptional()
  @IsEnum(Recurrence)
  recurrence?: Recurrence;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
