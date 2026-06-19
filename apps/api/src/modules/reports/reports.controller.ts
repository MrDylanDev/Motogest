import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DateRangeDto } from './dto/date-range.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @Roles('admin_taller', 'recepcionista')
  getDashboardMetrics() {
    return this.reportsService.getDashboardMetrics();
  }

  @Get('revenue')
  @Roles('admin_taller', 'recepcionista')
  getRevenueReport(@Query() dateRange: DateRangeDto) {
    return this.reportsService.getRevenueReport(
      dateRange.startDate,
      dateRange.endDate,
    );
  }

  @Get('mechanics/performance')
  @Roles('admin_taller', 'recepcionista')
  getMechanicPerformance(@Query() dateRange: DateRangeDto) {
    return this.reportsService.getMechanicPerformance(
      dateRange.startDate,
      dateRange.endDate,
    );
  }

  @Get('work-orders/stats')
  @Roles('admin_taller', 'recepcionista', 'mecanico')
  getWorkOrderStats() {
    return this.reportsService.getWorkOrderStats();
  }
}
