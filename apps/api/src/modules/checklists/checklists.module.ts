import { Module, forwardRef } from '@nestjs/common';
import { ChecklistsController } from './checklists.controller';
import { TemplatesService } from './templates.service';
import { ExecutionsService } from './executions.service';
import { WorkOrdersModule } from '../work-orders/work-orders.module';

@Module({
  imports: [forwardRef(() => WorkOrdersModule)],
  controllers: [ChecklistsController],
  providers: [TemplatesService, ExecutionsService],
  exports: [ExecutionsService],
})
export class ChecklistsModule {}
