import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateCreditCardDto {
  @IsUUID()
  portfolioId!: string;

  @IsString()
  title!: string;

  @IsNumber()
  @Min(0)
  limitAmount!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  graceDays?: number;
}

export class UpdateCreditCardDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  limitAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  graceDays?: number;
}

export class CreateCreditCardChargeDto {
  @IsString()
  title!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsDateString()
  spentAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  graceDays?: number;

  @IsOptional()
  @IsString()
  aiLogId?: string;
}

export class UpdateCreditCardChargeDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsDateString()
  spentAt?: string;
}

export class CreateCreditCardPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class CreateCreditCardChargeFromAiDto {
  @IsUUID()
  logId!: string;
}
