import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Евгений' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'evgeny@example.com' })
  @ValidateIf((o) => !o.phone)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+79991234567' })
  @ValidateIf((o) => !o.email)
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @ApiProperty({ example: 'StrongPass123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Пароль должен быть не короче 8 символов' })
  password: string;

  @ApiPropertyOptional({ example: 'RUB' })
  @IsOptional()
  @IsString()
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: 'Europe/Moscow' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'evgeny@example.com', description: 'email или телефон' })
  @IsString()
  @IsNotEmpty()
  login: string;

  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'evgeny@example.com', description: 'email или телефон' })
  @IsString()
  @IsNotEmpty()
  login: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'evgeny@example.com' })
  @IsString()
  @IsNotEmpty()
  login: string;

  @ApiProperty({ example: '123456', description: 'код из письма/SMS' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
