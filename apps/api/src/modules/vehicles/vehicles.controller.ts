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
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { QueryVehicleDto } from './dto/query-vehicle.dto';
import { TenantContextInterceptor } from '../../common/tenant/tenant-context.interceptor';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('vehicles')
@UseInterceptors(TenantContextInterceptor)
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  @Roles('admin_taller', 'recepcionista')
  create(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(this.tenantContext.tenantId, dto);
  }

  @Get()
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  findAll(@Query() query: QueryVehicleDto) {
    return this.vehiclesService.findAll(this.tenantContext.tenantId, query);
  }

  @Get(':id')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(this.tenantContext.tenantId, id);
  }

  @Patch(':id')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehiclesService.update(this.tenantContext.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('admin_taller', 'recepcionista')
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(this.tenantContext.tenantId, id);
  }
}
