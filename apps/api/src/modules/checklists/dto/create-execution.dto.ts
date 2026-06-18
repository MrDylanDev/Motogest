import { IsUUID } from 'class-validator';

export class CreateExecutionDto {
  @IsUUID()
  templateId: string;

  @IsUUID()
  mechanicId: string;
}
