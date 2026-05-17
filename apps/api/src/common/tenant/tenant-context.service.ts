import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  tenantId: string;
  userId: string;
}

@Injectable()
export class TenantContext {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, callback: () => T): T {
    return this.als.run(store, callback);
  }

  get tenantId(): string {
    const store = this.als.getStore();
    if (!store) {
      throw new InternalServerErrorException(
        'TenantContext not initialized — request without tenant scope',
      );
    }
    return store.tenantId;
  }

  get userId(): string {
    const store = this.als.getStore();
    if (!store) {
      throw new InternalServerErrorException(
        'TenantContext not initialized — request without tenant scope',
      );
    }
    return store.userId;
  }
}
