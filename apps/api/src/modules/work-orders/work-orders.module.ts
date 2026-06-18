import { Module, forwardRef } from '@nestjs/common';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { PartsService } from './parts.service';
import { CostService } from './cost.service';
import { ChecklistsModule } from '../checklists/checklists.module';

@Module({
  imports: [forwardRef(() => ChecklistsModule)],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, PartsService, CostService],
  exports: [WorkOrdersService, PartsService, CostService],
})
export class WorkOrdersModule {}
