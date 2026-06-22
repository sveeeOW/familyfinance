import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateCreditDto {
  @ApiProperty()
  @IsUUID()
  portfolioId: string;

  @ApiProperty({ example: 'Ипотека' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Сбербанк' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({ example: 5000000 })
  @IsNumber()
  initialAmount: number;

  @ApiProperty({ example: 4200000 })
  @IsNumber()
  remainingAmount: number;

  @ApiProperty({ example: 55000 })
  @IsNumber()
  monthlyPayment: number;

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  interestRate?: number;

  @ApiProperty({ example: 10, description: 'число месяца — день платежа' })
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay: number;

  @ApiPropertyOptional({ example: '2022-01-01' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2032-01-01' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpdateCreditDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  remainingAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  monthlyPayment?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}
