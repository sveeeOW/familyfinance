import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetType, DividendStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateInvestmentDto {
  @ApiProperty()
  @IsUUID()
  portfolioId: string;

  @ApiProperty({ example: 'Сбербанк ао' })
  @IsString()
  assetName: string;

  @ApiProperty({ enum: AssetType, default: AssetType.STOCK })
  @IsEnum(AssetType)
  assetType: AssetType;

  @ApiProperty({ example: 100 })
  @IsNumber()
  quantity: number;

  @ApiProperty({ example: 250.5 })
  @IsNumber()
  averageBuyPrice: number;

  @ApiPropertyOptional({ example: 310.2 })
  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @ApiPropertyOptional({ example: 'RUB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expectedDividends?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpdateInvestmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expectedDividends?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateDividendDto {
  @ApiProperty()
  @IsUUID()
  portfolioId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  investmentId?: string;

  @ApiProperty({ example: 1500 })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: '2026-07-15' })
  @IsOptional()
  @IsString()
  expectedDate?: string;

  @ApiPropertyOptional({ enum: DividendStatus, default: DividendStatus.EXPECTED })
  @IsOptional()
  @IsEnum(DividendStatus)
  status?: DividendStatus;
}

export class UpdateDividendDto {
  @ApiPropertyOptional({ enum: DividendStatus })
  @IsOptional()
  @IsEnum(DividendStatus)
  status?: DividendStatus;

  @ApiPropertyOptional({ example: '2026-07-15' })
  @IsOptional()
  @IsString()
  receivedDate?: string;
}
