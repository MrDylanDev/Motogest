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
import { MechanicsService } from './mechanics.service';
import { CreateMechanicDto } from './dto/create-mechanic.dto';
import { UpdateMechanicDto } from './dto/update-mechanic.dto';
import { QueryMechanicDto } from './dto/query-mechanic.dto';
import { TenantContextInterceptor } from '../../common/tenant/tenant-context.interceptor';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('mechanics')
@UseInterceptors(TenantContextInterceptor)
export class MechanicsController {
  constructor(
    private readonly mechanicsService: MechanicsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  @Roles('admin_taller', 'recepcionista')
  create(@Body() dto: CreateMechanicDto) {
    return this.mechanicsService.create(this.tenantContext.tenantId, dto);
  }

  @Get()
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  findAll(@Query() query: QueryMechanicDto) {
    return this.mechanicsService.findAll(this.tenantContext.tenantId, query);
  }

  @Get(':id')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  findOne(@Param('id') id: string) {
    return this.mechanicsService.findOne(this.tenantContext.tenantId, id);
  }

  @Patch(':id')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  update(@Param('id') id: string, @Body() dto: UpdateMechanicDto) {
    return this.mechanicsService.update(this.tenantContext.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('admin_taller', 'recepcionista')
  remove(@Param('id') id: string) {
    return this.mechanicsService.remove(this.tenantContext.tenantId, id);
  }
}
