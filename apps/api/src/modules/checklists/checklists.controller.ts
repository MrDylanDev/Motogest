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
} from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { ExecutionsService } from './executions.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { QueryTemplateDto } from './dto/query-template.dto';
import { CreateExecutionDto } from './dto/create-execution.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { TenantContextInterceptor } from '../../common/tenant/tenant-context.interceptor';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller()
@UseInterceptors(TenantContextInterceptor)
export class ChecklistsController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly executionsService: ExecutionsService,
    private readonly tenantContext: TenantContext,
  ) {}

  // Templates endpoints

  @Get('checklist-templates')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  findAllTemplates(@Query() query: QueryTemplateDto) {
    return this.templatesService.findAll(this.tenantContext.tenantId, query);
  }

  @Get('checklist-templates/:id')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  findOneTemplate(@Param('id') id: string) {
    return this.templatesService.findOne(this.tenantContext.tenantId, id);
  }

  @Post('checklist-templates')
  @Roles('admin_taller', 'recepcionista')
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.templatesService.create(this.tenantContext.tenantId, dto);
  }

  @Patch('checklist-templates/:id')
  @Roles('admin_taller', 'recepcionista')
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(this.tenantContext.tenantId, id, dto);
  }

  @Delete('checklist-templates/:id')
  @Roles('admin_taller', 'recepcionista')
  removeTemplate(@Param('id') id: string) {
    return this.templatesService.remove(this.tenantContext.tenantId, id);
  }

  // Executions endpoints

  @Post('work-orders/:id/checklists')
  @Roles('admin_taller', 'recepcionista')
  assignChecklist(
    @Param('id') workOrderId: string,
    @Body() dto: CreateExecutionDto,
  ) {
    return this.executionsService.assign(
      this.tenantContext.tenantId,
      workOrderId,
      dto,
    );
  }

  @Get('work-orders/:id/checklists')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  listChecklistsByWorkOrder(@Param('id') workOrderId: string) {
    return this.executionsService.listByWorkOrder(
      this.tenantContext.tenantId,
      workOrderId,
    );
  }

  @Get('checklist-executions/:id')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  findOneExecution(@Param('id') id: string) {
    return this.executionsService.findOne(this.tenantContext.tenantId, id);
  }

  @Patch('checklist-executions/:id/start')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  startExecution(@Param('id') id: string) {
    return this.executionsService.start(this.tenantContext.tenantId, id);
  }

  @Post('checklist-executions/:id/answers')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  submitAnswer(@Param('id') id: string, @Body() dto: SubmitAnswerDto) {
    return this.executionsService.submitAnswer(
      this.tenantContext.tenantId,
      id,
      dto,
    );
  }

  @Post('checklist-executions/:id/complete')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  completeExecution(@Param('id') id: string) {
    return this.executionsService.complete(this.tenantContext.tenantId, id);
  }
}
