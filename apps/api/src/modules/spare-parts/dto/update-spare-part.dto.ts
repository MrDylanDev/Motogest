import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateSparePartDto } from './create-spare-part.dto';

export class UpdateSparePartDto extends PartialType(CreateSparePartDto) {
  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;
}
