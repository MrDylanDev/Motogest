import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ChecklistExecution } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateExecutionDto } from './dto/create-execution.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';

@Injectable()
export class ExecutionsService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(
    tenantId: string,
    workOrderId: string,
    dto: CreateExecutionDto,
  ): Promise<ChecklistExecution> {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Validate work order exists
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
      });
      if (!workOrder) {
        throw new NotFoundException('Work order not found');
      }

      // Validate template exists
      const template = await tx.checklistTemplate.findFirst({
        where: { id: dto.templateId, tenantId, isActive: true },
      });
      if (!template) {
        throw new NotFoundException('Template not found');
      }

      // Validate mechanic exists
      const mechanic = await tx.mechanic.findFirst({
        where: { id: dto.mechanicId, tenantId },
      });
      if (!mechanic) {
        throw new NotFoundException('Mechanic not found');
      }

      // Create execution
      return tx.checklistExecution.create({
        data: {
          tenantId,
          templateId: dto.templateId,
          workOrderId,
          mechanicId: dto.mechanicId,
          status: 'pending',
        },
        include: {
          template: {
            include: {
              sections: {
                include: {
                  questions: true,
                },
              },
            },
          },
          workOrder: true,
          mechanic: true,
        },
      });
    });
  }

  async listByWorkOrder(
    tenantId: string,
    workOrderId: string,
  ): Promise<ChecklistExecution[]> {
    return this.prisma.withRlsTransaction(async (tx) => {
      // Validate work order exists
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
      });
      if (!workOrder) {
        throw new NotFoundException('Work order not found');
      }

      return tx.checklistExecution.findMany({
        where: { workOrderId, tenantId },
        include: {
          template: {
            include: {
              sections: {
                include: {
                  questions: true,
                },
              },
            },
          },
          mechanic: true,
          answers: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async findOne(tenantId: string, id: string): Promise<ChecklistExecution> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const execution = await tx.checklistExecution.findFirst({
        where: { id, tenantId },
        include: {
          template: {
            include: {
              sections: {
                include: {
                  questions: true,
                },
              },
            },
          },
          workOrder: true,
          mechanic: true,
          answers: {
            include: {
              question: true,
            },
          },
        },
      });

      if (!execution) {
        throw new NotFoundException('Execution not found');
      }

      return execution;
    });
  }

  async start(tenantId: string, id: string): Promise<ChecklistExecution> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const execution = await tx.checklistExecution.findFirst({
        where: { id, tenantId },
      });

      if (!execution) {
        throw new NotFoundException('Execution not found');
      }

      if (execution.status !== 'pending') {
        throw new BadRequestException('Execution must be pending to start');
      }

      return tx.checklistExecution.update({
        where: { id },
        data: {
          status: 'in_progress',
          startedAt: new Date(),
        },
        include: {
          template: {
            include: {
              sections: {
                include: {
                  questions: true,
                },
              },
            },
          },
          mechanic: true,
        },
      });
    });
  }

  async submitAnswer(
    tenantId: string,
    executionId: string,
    dto: SubmitAnswerDto,
  ) {
    return this.prisma.withRlsTransaction(async (tx) => {
      const execution = await tx.checklistExecution.findFirst({
        where: { id: executionId, tenantId },
        include: {
          template: {
            include: {
              sections: {
                include: {
                  questions: true,
                },
              },
            },
          },
        },
      });

      if (!execution) {
        throw new NotFoundException('Execution not found');
      }

      if (execution.status !== 'in_progress') {
        throw new BadRequestException(
          'Execution must be in progress to submit answers',
        );
      }

      // Validate question belongs to template
      const question = execution.template.sections
        .flatMap((s) => s.questions)
        .find((q) => q.id === dto.questionId);

      if (!question) {
        throw new BadRequestException('Question does not belong to template');
      }

      // Create or update answer
      return tx.checklistAnswer.upsert({
        where: {
          executionId_questionId: {
            executionId,
            questionId: dto.questionId,
          },
        },
        create: {
          tenantId,
          executionId,
          questionId: dto.questionId,
          answer: dto.answer,
        },
        update: {
          answer: dto.answer,
        },
        include: {
          question: true,
        },
      });
    });
  }

  async complete(tenantId: string, id: string): Promise<ChecklistExecution> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const execution = await tx.checklistExecution.findFirst({
        where: { id, tenantId },
        include: {
          answers: {
            include: {
              question: true,
            },
          },
          template: {
            include: {
              sections: {
                include: {
                  questions: true,
                },
              },
            },
          },
        },
      });

      if (!execution) {
        throw new NotFoundException('Execution not found');
      }

      if (execution.status !== 'in_progress') {
        throw new BadRequestException(
          'Execution must be in progress to complete',
        );
      }

      // Validate all required questions have answers
      const allQuestions = execution.template.sections.flatMap(
        (s) => s.questions,
      );

      const requiredQuestions = allQuestions.filter((q) => q.isRequired);
      const answeredQuestionIds = execution.answers.map((a) => a.questionId);
      const missingQuestions = requiredQuestions.filter(
        (q) => !answeredQuestionIds.includes(q.id),
      );

      if (missingQuestions.length > 0) {
        throw new BadRequestException(
          `Missing required answers: ${missingQuestions.map((q) => q.text).join(', ')}`,
        );
      }

      // Calculate score
      const { score, passed } = this.calculateScore(execution);

      // Update execution
      return tx.checklistExecution.update({
        where: { id },
        data: {
          status: 'completed',
          score,
          passed,
          completedAt: new Date(),
        },
        include: {
          template: true,
          mechanic: true,
          answers: true,
        },
      });
    });
  }

  private calculateScore(
    execution: ChecklistExecution & {
      answers: Array<{
        answer: string;
        question: { type: string; weight: number; options?: any };
      }>;
    },
  ): { score: number; passed: boolean } {
    let earnedPoints = 0;
    let totalPoints = 0;

    for (const answer of execution.answers) {
      const question = answer.question;
      totalPoints += question.weight;

      switch (question.type) {
        case 'boolean':
          if (answer.answer === 'true') {
            earnedPoints += question.weight;
          }
          break;
        case 'number':
        case 'selection':
          const correctAnswer = question.options?.correct;
          if (answer.answer === correctAnswer) {
            earnedPoints += question.weight;
          }
          break;
        case 'text':
          // Always correct, manual review
          earnedPoints += question.weight;
          break;
      }
    }

    const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const passed = score >= 80;

    return { score: Math.round(score * 100) / 100, passed };
  }

  async validateChecklistsForCompletion(
    tenantId: string,
    workOrderId: string,
  ): Promise<void> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const executions = await tx.checklistExecution.findMany({
        where: { workOrderId, tenantId },
        include: {
          template: {
            include: {
              sections: true,
            },
          },
        },
      });

      // Check if there are required sections
      const hasRequiredSections = executions.some((e) =>
        e.template.sections.some((s) => s.isRequired),
      );

      if (!hasRequiredSections) {
        return; // No required checklists
      }

      const pendingExecutions = executions.filter(
        (e) => e.status !== 'completed',
      );

      if (pendingExecutions.length > 0) {
        throw new BadRequestException(
          'Cannot complete work order: pending required checklists',
        );
      }
    });
  }
}
