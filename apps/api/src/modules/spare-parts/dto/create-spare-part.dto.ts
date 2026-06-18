import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateSparePartDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  unit?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  currentStock?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  minStock?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  maxStock?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unitCost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  sellingPrice?: number;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  supplier?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
