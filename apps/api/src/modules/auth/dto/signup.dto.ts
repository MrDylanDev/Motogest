import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MaxLength(200)
  fullName: string;

  @IsString()
  @MaxLength(200)
  tenantName: string;

  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/)
  tenantSlug: string;
}
