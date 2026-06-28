import { IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDriverDto {
  @IsString()
  @Matches(/^\+?[0-9]\d{7,14}$/, { message: 'phone must be a valid phone number' })
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsOptional()
  licenseNo?: string;

  @IsString()
  @IsOptional()
  assignedSupplierId?: string;
}
