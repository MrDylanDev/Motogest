import { Module } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { TenantContextModule } from '../../common/tenant/tenant-context.module';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
