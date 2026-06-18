import { PartialType } from '@nestjs/mapped-types';
import {
  IsOptional,
  IsString,
  MaxLength,
  IsNumber,
  Min,
} from 'class-validator';
import { CreateMechanicDto } from './create-mechanic.dto';

export class UpdateMechanicDto extends PartialType(CreateMechanicDto) {
  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  hourlyRate?: number;
}
