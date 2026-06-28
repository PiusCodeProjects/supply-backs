// ─── DTOs ─────────────────────────────────────────────────────────────────────
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterContractorDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\+?[0-9]\d{7,14}$/, { message: 'phone must be a valid phone number' })
  phone: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsOptional()
  company?: string;
}
