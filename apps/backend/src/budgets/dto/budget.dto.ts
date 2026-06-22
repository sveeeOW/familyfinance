import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetScope } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateBudgetDto {
  @ApiProperty()
  @IsUUID()
  portfolioId: string;

  @ApiProperty({ enum: BudgetScope })
  @IsEnum(BudgetScope)
  scope: BudgetScope;

  @ApiPropertyOptional({ description: 'для scope=CATEGORY' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'для scope=MEMBER' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ example: 30000 })
  @IsNumber()
  limitAmount: number;

  @ApiPropertyOptional({ default: 80, description: 'уведомить при достижении % лимита' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  warnPercent?: number;
}
