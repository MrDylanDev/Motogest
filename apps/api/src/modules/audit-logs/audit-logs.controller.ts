import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  NotFoundException,
  UseInterceptors,
} from '@nestjs/common';
import type { AuditLog } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContextInterceptor } from '../../common/tenant/tenant-context.interceptor';

@Controller('audit-logs')
@UseInterceptors(TenantContextInterceptor)
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll(): Promise<AuditLog[]> {
    return this.prisma.withRlsTransaction(async (tx) =>
      tx.auditLog.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AuditLog> {
    return this.prisma.withRlsTransaction(async (tx) => {
      const log = await tx.auditLog.findUnique({ where: { id } });
      if (!log) {
        throw new NotFoundException();
      }
      return log;
    });
  }
}
