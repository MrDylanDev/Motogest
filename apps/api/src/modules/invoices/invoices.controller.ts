import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryInvoiceDto } from './dto/query-invoice.dto';
import { ReportSummaryDto } from './dto/report-summary.dto';
import { TenantContextInterceptor } from '../../common/tenant/tenant-context.interceptor';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: string;
}

@Controller()
@UseInterceptors(TenantContextInterceptor)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Roles('admin_taller', 'recepcionista')
  @Post('work-orders/:id/invoice')
  createInvoice(
    @Param('id') workOrderId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.createInvoice(
      this.tenantContext.tenantId,
      workOrderId,
      dto,
    );
  }

  @Roles('admin_taller', 'recepcionista', 'mecanico')
  @Get('invoices')
  findAll(
    @Query() query: QueryInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoicesService.findAll(
      this.tenantContext.tenantId,
      query,
      user.id,
      user.role,
    );
  }

  @Roles('admin_taller', 'recepcionista')
  @Get('invoices/reports/summary')
  getReportSummary(@Query() query: ReportSummaryDto) {
    return this.invoicesService.getReportSummary(
      this.tenantContext.tenantId,
      query.dateFrom ? new Date(query.dateFrom) : undefined,
      query.dateTo ? new Date(query.dateTo) : undefined,
    );
  }

  @Roles('admin_taller', 'recepcionista', 'mecanico')
  @Get('invoices/:id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(this.tenantContext.tenantId, id);
  }

  @Roles('admin_taller', 'recepcionista')
  @Post('invoices/:id/pay')
  registerPayment(
    @Param('id') id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.registerPayment(
      this.tenantContext.tenantId,
      id,
      dto,
      user.id,
    );
  }

  @Roles('admin_taller', 'recepcionista')
  @Post('invoices/:id/cancel')
  cancelInvoice(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoicesService.cancelInvoice(
      this.tenantContext.tenantId,
      id,
      user.id,
    );
  }
}
