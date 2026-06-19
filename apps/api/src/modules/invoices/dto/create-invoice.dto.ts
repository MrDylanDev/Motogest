import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
