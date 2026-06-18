import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsArray,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreateMechanicDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  specializations?: string[];

  @IsDateString()
  @IsOptional()
  hireDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
