import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identifier: string; // email or phone

  @IsString()
  @IsNotEmpty()
  password: string;
}
