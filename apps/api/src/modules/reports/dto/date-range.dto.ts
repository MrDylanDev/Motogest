import { IsOptional, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';

export class DateRangeDto {
  @IsOptional()
  @IsISO8601()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @IsISO8601()
  @Type(() => Date)
  endDate?: Date;
}
