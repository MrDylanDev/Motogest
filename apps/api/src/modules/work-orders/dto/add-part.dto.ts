import { IsUUID, IsInt, Min } from 'class-validator';

export class AddPartDto {
  @IsUUID()
  sparePartId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
