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
import { SparePartsService } from './spare-parts.service';
import { CreateSparePartDto } from './dto/create-spare-part.dto';
import { UpdateSparePartDto } from './dto/update-spare-part.dto';
import { QuerySparePartDto } from './dto/query-spare-part.dto';
import { TenantContextInterceptor } from '../../common/tenant/tenant-context.interceptor';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('spare-parts')
@UseInterceptors(TenantContextInterceptor)
export class SparePartsController {
  constructor(
    private readonly sparePartsService: SparePartsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  @Roles('admin_taller', 'recepcionista')
  create(@Body() dto: CreateSparePartDto) {
    return this.sparePartsService.create(this.tenantContext.tenantId, dto);
  }

  @Get()
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  findAll(@Query() query: QuerySparePartDto) {
    return this.sparePartsService.findAll(this.tenantContext.tenantId, query);
  }

  @Get(':id')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  findOne(@Param('id') id: string) {
    return this.sparePartsService.findOne(this.tenantContext.tenantId, id);
  }

  @Patch(':id')
  @Roles('admin_taller', 'recepcionista')
  update(@Param('id') id: string, @Body() dto: UpdateSparePartDto) {
    return this.sparePartsService.update(this.tenantContext.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('admin_taller', 'recepcionista')
  remove(@Param('id') id: string) {
    return this.sparePartsService.remove(this.tenantContext.tenantId, id);
  }
}
