import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}

export class ResendOtpDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
