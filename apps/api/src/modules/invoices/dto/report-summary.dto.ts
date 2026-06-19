import { IsOptional, IsISO8601 } from 'class-validator';

export class ReportSummaryDto {
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
