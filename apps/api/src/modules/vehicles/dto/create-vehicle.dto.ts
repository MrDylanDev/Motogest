import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsInt,
  MinLength,
  MaxLength,
  Min,
  Max,
  Matches,
} from 'class-validator';

export class CreateVehicleDto {
  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  make: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model: string;

  @IsInt()
  @IsOptional()
  @Min(1886)
  @Max(new Date().getFullYear() + 1)
  year?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  plate: string;

  @IsString()
  @IsOptional()
  @MinLength(17)
  @MaxLength(17)
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/i, {
    message: 'VIN must be 17 characters (letters and numbers, no I, O, Q)',
  })
  vin?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  color?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  fuelType?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  mileage?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
