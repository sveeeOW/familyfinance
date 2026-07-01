import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccessLevel, MemberRole, PortfolioType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePortfolioDto {
  @ApiProperty({ example: 'Семейный бюджет' })
  @IsString()
  name: string;

  @ApiProperty({ enum: PortfolioType, example: PortfolioType.SHARED })
  @IsEnum(PortfolioType)
  type: PortfolioType;

  @ApiPropertyOptional({ example: 'RUB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 12500, description: 'Текущий остаток денег в портфеле' })
  @IsOptional()
  @IsNumber()
  currentBalance?: number;
}

export class UpdatePortfolioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: PortfolioType })
  @IsOptional()
  @IsEnum(PortfolioType)
  type?: PortfolioType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 12500, description: 'Текущий остаток денег в портфеле' })
  @IsOptional()
  @IsNumber()
  currentBalance?: number;
}

export class CreateInviteDto {
  @ApiPropertyOptional({ enum: MemberRole, default: MemberRole.MEMBER })
  @IsOptional()
  @IsEnum(MemberRole)
  role?: MemberRole;

  @ApiPropertyOptional({ enum: AccessLevel, default: AccessLevel.FULL })
  @IsOptional()
  @IsEnum(AccessLevel)
  accessLevel?: AccessLevel;

  @ApiPropertyOptional({ default: 1, description: 'сколько раз можно использовать ссылку' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional({ description: 'срок жизни ссылки в часах', default: 168 })
  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInHours?: number;
}

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: MemberRole })
  @IsOptional()
  @IsEnum(MemberRole)
  role?: MemberRole;

  @ApiPropertyOptional({ enum: AccessLevel })
  @IsOptional()
  @IsEnum(AccessLevel)
  accessLevel?: AccessLevel;
}
