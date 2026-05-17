import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../tenant/tenant-context.service';

export const TENANT_SCOPED_MODELS = [
  'AuditLog',
  'UserTenant',
  'Subscription',
] as const;
export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly tenantContext: TenantContext) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  scoped() {
    const tenantId = this.tenantContext.tenantId; // throws if no scope (intentional)
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({
            model,
            operation,
            args,
            query,
          }: {
            model: string;
            operation: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            args: Record<string, any>;
            query: (args: Record<string, unknown>) => Promise<unknown>;
          }) {
            if (!TENANT_SCOPED_MODELS.includes(model as TenantScopedModel)) {
              return query(args);
            }

            // READ ops → inject WHERE tenantId
            if (
              [
                'findUnique',
                'findUniqueOrThrow',
                'findFirst',
                'findFirstOrThrow',
                'findMany',
                'count',
                'aggregate',
                'groupBy',
              ].includes(operation)
            ) {
              args.where = { ...(args.where ?? {}), tenantId };
            }

            // CREATE ops → inject tenantId in data
            if (operation === 'create') {
              args.data = { ...(args.data ?? {}), tenantId };
            }
            if (operation === 'createMany') {
              const data = args.data;
              args.data = Array.isArray(data)
                ? data.map((d: Record<string, unknown>) => ({
                    ...d,
                    tenantId,
                  }))
                : { ...(data ?? {}), tenantId };
            }

            // UPDATE/DELETE ops → force WHERE tenantId
            if (
              [
                'update',
                'updateMany',
                'delete',
                'deleteMany',
                'upsert',
              ].includes(operation)
            ) {
              args.where = { ...(args.where ?? {}), tenantId };
            }

            return query(args);
          },
        },
      },
    });
  }

  /**
   * Executes a transaction with PostgreSQL RLS context set via SET LOCAL.
   * SET LOCAL is transaction-scoped — automatically reverts on TX close.
   * Nested withRlsTransaction behavior (inner SET LOCAL overrides outer)
   * is covered in e2e tests (Capa 4) since it depends on real PostgreSQL.
   */
  async withRlsTransaction<T>(
    fn: (tx: PrismaClient) => Promise<T>,
  ): Promise<T> {
    const tenantId = this.tenantContext.tenantId;
    return this.$transaction(
      async (tx: {
        $executeRawUnsafe: (query: string) => Promise<unknown>;
      }) => {
        // Defense in depth: validate UUID even though TenantContextInterceptor
        // already validates. Protects against code paths that bypass the interceptor.
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            tenantId,
          )
        ) {
          throw new InternalServerErrorException(
            'Invalid tenantId in TenantContext',
          );
        }
        await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
        return fn(tx as unknown as PrismaClient);
      },
    );
  }
}
