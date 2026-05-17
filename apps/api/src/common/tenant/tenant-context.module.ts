import { Global, Module } from '@nestjs/common';
import { TenantContext } from './tenant-context.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';

@Global()
@Module({
  providers: [TenantContext, TenantContextInterceptor],
  exports: [TenantContext, TenantContextInterceptor],
})
export class TenantContextModule {}
