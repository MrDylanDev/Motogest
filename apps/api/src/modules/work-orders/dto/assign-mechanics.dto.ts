import { IsUUID, IsArray, IsOptional, ArrayMinSize } from 'class-validator';

export class AssignMechanicsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  mechanicIds: string[];

  @IsUUID()
  @IsOptional()
  primaryMechanicId?: string;
}
