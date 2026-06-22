import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Recurrence } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateRecurringDto {
  @ApiProperty()
  @IsUUID()
  portfolioId: string;

  @ApiProperty({ example: 'Оплата квартиры' })
  @IsString()
  title: string;

  @ApiProperty({ example: 75000 })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ example: 1, description: 'число месяца' })
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay: number;

  @ApiPropertyOptional({ enum: Recurrence, default: Recurrence.MONTHLY })
  @IsOptional()
  @IsEnum(Recurrence)
  recurrence?: Recurrence;

  @ApiPropertyOptional({ description: 'ответственный пользователь' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ type: [Number], default: [7, 3, 1, 0] })
  @IsOptional()
  @IsArray()
  reminderDays?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpdateRecurringDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}
