import { IsUUID, IsString } from 'class-validator';

export class SubmitAnswerDto {
  @IsUUID()
  questionId: string;

  @IsString()
  answer: string;
}
