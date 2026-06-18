import { IsString, IsIn, IsNotEmpty } from 'class-validator';

export class TransitionMilestoneDto {
  @IsString()
  @IsNotEmpty()
  @IsIn([
    'assigned',
    'in_progress',
    'completed',
    'invoiced',
    'paid',
    'delivered',
    'cancelled',
  ])
  milestone: string;
}
