import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { PartsService } from './parts.service';
import { CostService } from './cost.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { QueryWorkOrderDto } from './dto/query-work-order.dto';
import { AssignMechanicsDto } from './dto/assign-mechanics.dto';
import { TransitionMilestoneDto } from './dto/transition-milestone.dto';
import { AddPartDto } from './dto/add-part.dto';
import { TenantContextInterceptor } from '../../common/tenant/tenant-context.interceptor';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: string;
}

@Controller('work-orders')
@UseInterceptors(TenantContextInterceptor)
export class WorkOrdersController {
  constructor(
    private readonly workOrdersService: WorkOrdersService,
    private readonly partsService: PartsService,
    private readonly costService: CostService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  @Roles('admin_taller', 'recepcionista')
  create(@Body() dto: CreateWorkOrderDto) {
    return this.workOrdersService.create(this.tenantContext.tenantId, dto);
  }

  @Get()
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  findAll(
    @Query() query: QueryWorkOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role === 'mecanico') {
      return this.workOrdersService.findAssignedToMechanic(
        this.tenantContext.tenantId,
        user.id,
        query,
      );
    }
    return this.workOrdersService.findAll(this.tenantContext.tenantId, query);
  }

  @Get(':id')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const workOrder = await this.workOrdersService.findOne(
      this.tenantContext.tenantId,
      id,
    );

    // Mecánico solo puede ver OTs donde está asignado
    if (user.role === 'mecanico') {
      const isAssigned = workOrder.mechanics.some(
        (m) => m.mechanicId === user.id,
      );
      if (!isAssigned) {
        throw new NotFoundException('Work order not found');
      }
    }

    return workOrder;
  }

  @Patch(':id')
  @Roles('admin_taller', 'recepcionista')
  update(@Param('id') id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.workOrdersService.update(this.tenantContext.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('admin_taller', 'recepcionista')
  cancel(@Param('id') id: string) {
    return this.workOrdersService.cancel(this.tenantContext.tenantId, id);
  }

  @Post(':id/mechanics')
  @Roles('admin_taller', 'recepcionista')
  assignMechanics(@Param('id') id: string, @Body() dto: AssignMechanicsDto) {
    return this.workOrdersService.assignMechanics(
      this.tenantContext.tenantId,
      id,
      dto,
    );
  }

  @Delete(':id/mechanics/:mechanicId')
  @Roles('admin_taller', 'recepcionista')
  unassignMechanic(
    @Param('id') id: string,
    @Param('mechanicId') mechanicId: string,
  ) {
    return this.workOrdersService.unassignMechanic(
      this.tenantContext.tenantId,
      id,
      mechanicId,
    );
  }

  @Patch(':id/transition')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  async transitionMilestone(
    @Param('id') id: string,
    @Body() dto: TransitionMilestoneDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Mecánico solo puede hacer transition si está asignado
    if (user.role === 'mecanico') {
      const workOrder = await this.workOrdersService.findOne(
        this.tenantContext.tenantId,
        id,
      );
      const isAssigned = workOrder.mechanics.some(
        (m) => m.mechanicId === user.id,
      );
      if (!isAssigned) {
        throw new NotFoundException('Work order not found');
      }
    }

    return this.workOrdersService.transitionMilestone(
      this.tenantContext.tenantId,
      id,
      dto,
    );
  }

  @Post(':id/parts')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  async addPart(
    @Param('id') id: string,
    @Body() dto: AddPartDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Mecánico solo puede agregar repuestos si está asignado
    if (user.role === 'mecanico') {
      const workOrder = await this.workOrdersService.findOne(
        this.tenantContext.tenantId,
        id,
      );
      const isAssigned = workOrder.mechanics.some(
        (m) => m.mechanicId === user.id,
      );
      if (!isAssigned) {
        throw new NotFoundException('Work order not found');
      }
    }

    return this.partsService.addPart(
      this.tenantContext.tenantId,
      id,
      dto.sparePartId,
      dto.quantity,
    );
  }

  @Delete(':id/parts/:partId')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  async removePart(
    @Param('id') id: string,
    @Param('partId') partId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Mecánico solo puede quitar repuestos si está asignado
    if (user.role === 'mecanico') {
      const workOrder = await this.workOrdersService.findOne(
        this.tenantContext.tenantId,
        id,
      );
      const isAssigned = workOrder.mechanics.some(
        (m) => m.mechanicId === user.id,
      );
      if (!isAssigned) {
        throw new NotFoundException('Work order not found');
      }
    }

    return this.partsService.removePart(
      this.tenantContext.tenantId,
      id,
      partId,
    );
  }

  @Get(':id/parts')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  async listParts(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Mecánico solo puede ver repuestos si está asignado
    if (user.role === 'mecanico') {
      const workOrder = await this.workOrdersService.findOne(
        this.tenantContext.tenantId,
        id,
      );
      const isAssigned = workOrder.mechanics.some(
        (m) => m.mechanicId === user.id,
      );
      if (!isAssigned) {
        throw new NotFoundException('Work order not found');
      }
    }

    return this.partsService.listParts(this.tenantContext.tenantId, id);
  }

  @Get(':id/costs')
  @Roles('admin_taller', 'recepcionista')
  getCosts(@Param('id') id: string) {
    return this.costService.getCosts(this.tenantContext.tenantId, id);
  }

  @Post(':id/costs/calculate')
  @Roles('admin_taller', 'recepcionista')
  calculateCosts(@Param('id') id: string) {
    return this.costService.calculate(this.tenantContext.tenantId, id);
  }
}
