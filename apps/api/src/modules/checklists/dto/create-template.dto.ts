import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
  IsIn,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuestionDto {
  @IsString()
  @MaxLength(1000)
  text: string;

  @IsString()
  @IsIn(['text', 'number', 'boolean', 'selection'])
  type: string;

  @IsOptional()
  options?: any;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsNumber()
  order: number;

  @IsNumber()
  @IsOptional()
  weight?: number;
}

export class CreateSectionDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsNumber()
  order: number;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}

export class CreateTemplateDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSectionDto)
  sections: CreateSectionDto[];
}
