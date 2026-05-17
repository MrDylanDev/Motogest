# ADR-0001 — Estrategia Multi-Tenancy

| | |
|---|---|
| **Estado** | Accepted |
| **Fecha** | 2026-05-16 |
| **Decisores** | Equipo de Arquitectura |
| **Supersede** | — |
| **Superseded by** | — |

---

## 1. Contexto

La Plataforma SaaS de gestión de talleres mecánicos requiere aislar los datos de cada taller (tenant) garantizando que ningún tenant pueda ver, modificar o inferir datos de otro. Se proyectan cientos a miles de tenants, cada uno con bajo volumen de datos individual (decenas a pocas miles de filas por tabla por tenant).

La documentación inicial (`documentacion_taller_mecanico/03_arquitectura_multi_tenant.md` y `41_modelos_datos.md`) describía una estrategia **schema-per-tenant** ("database-per-schema"). El código real (`apps/api/prisma/schema.prisma` + `.env.example`) ya implementa **shared schema con tenant_id**. Esta ADR formaliza la decisión y descarta explícitamente la estrategia anterior.

### Stack relevante para la decisión

- ORM: **Prisma 6.6**
- Base de datos: **PostgreSQL 15**
- Backend: **NestJS 10**
- Auth: **JWT** (configurado en `.env.example`)

---

## 2. Decisión

> **Adoptamos Shared Schema + `tenant_id` + PostgreSQL Row-Level Security (RLS) como la estrategia oficial de multi-tenancy.**

Toda tabla con datos por-tenant debe cumplir:

1. Llevar columna `tenant_id UUID NOT NULL` con FK a `tenants.id`.
2. Tener al menos un índice compuesto que comience por `tenant_id`.
3. Tener `ROW LEVEL SECURITY` activado con política que filtre por `current_setting('app.tenant_id')::uuid`.

La estrategia se sostiene en **tres capas de defensa** que deben implementarse antes de codear cualquier módulo de negocio:

- **Capa 1 — Aplicación (NestJS):** `TenantContext` que extrae `tenantId` del JWT y lo expone via `AsyncLocalStorage`.
- **Capa 2 — ORM (Prisma `$extends`):** todas las queries de modelos por-tenant agregan automáticamente `WHERE tenant_id = ?`.
- **Capa 3 — Base de datos (PostgreSQL RLS):** RLS activado en todas las tablas por-tenant, con `SET LOCAL app.tenant_id = '<uuid>'` por transacción.

Si una capa falla por bug, las otras dos cubren el aislamiento.

---

## 3. Alternativas consideradas

### 3.1 Database-per-tenant (descartada)

Cada tenant tiene su propia base de datos PostgreSQL.

- ✅ Aislamiento físico máximo
- ✅ Backup/restore por-tenant trivial
- ❌ Operación inviable a escala: N migraciones por release, N conexiones, N backups
- ❌ Cross-tenant analytics requieren ETL externo
- ❌ Provisioning de nuevos tenants requiere crear DB → orquestación compleja
- ❌ Costos de infraestructura crecen lineal con tenants

**Veredicto:** overkill para el perfil del producto (muchos tenants chicos, no pocos tenants grandes).

### 3.2 Schema-per-tenant (descartada)

Una sola base de datos PostgreSQL, un schema por tenant.

- ✅ Aislamiento alto (separación lógica fuerte)
- ✅ Backup por-tenant relativamente simple
- ❌ **Incompatible con Prisma**: el feature `multiSchema` requiere schemas declarados estáticamente en `schema.prisma`. No soporta schemas dinámicos creados al provisionar un tenant.
- ❌ Workarounds (manipulación de `search_path`, generación de Prisma Clients por tenant, raw SQL) anulan la productividad y el type-safety que motivaron la elección de Prisma.
- ❌ Migraciones requieren correr en N schemas, complejidad operacional alta.

**Veredicto:** físicamente posible, pero **incompatible con la productividad del stack elegido**. La fragilidad operacional cancela la ganancia de aislamiento.

### 3.3 Shared Schema + tenant_id (sin RLS) (descartada)

Solo capa de aplicación filtra por `tenant_id`.

- ✅ Simple
- ❌ Un solo bug en una query no filtrada → leak de datos cross-tenant
- ❌ No hay defensa-en-profundidad

**Veredicto:** débil. Si vamos por shared schema, RLS es no-negociable.

---

## 4. Consecuencias

### Positivas

- Migraciones únicas y simples (`prisma migrate deploy` aplica a todos los tenants instantáneamente).
- Operación trivial: una base de datos, un backup, un connection pool.
- Cross-tenant analytics inmediatos para el SaaS owner (billing, métricas globales, etc.).
- Provisioning de tenant es solo un `INSERT INTO tenants`.
- Connection pooling estándar de PostgreSQL (sin search_path tricks).

### Negativas (aceptadas)

- Backup/restore por-tenant requiere `pg_dump --data-only` con filtros por `tenant_id` (no es un dump simple). Mitigable con scripts.
- Aislamiento depende de la triple defensa funcionando correctamente. Mitigable con tests obligatorios.
- "Noisy neighbor": un tenant grande puede impactar performance del resto. Mitigable con índices correctos y, si se vuelve problema, particionado por `tenant_id`.

### Disciplina obligatoria (NO negociable)

- ❗ **Toda tabla con datos por-tenant lleva `tenantId UUID NOT NULL`.** Sin excepciones.
- ❗ **Toda tabla con `tenantId` tiene RLS activado y política aplicada.** Sin excepciones.
- ❗ **El CI tiene un test de aislamiento que falla la build si una tabla por-tenant no tiene RLS o si una query devuelve datos de otro tenant.** No es opcional.

---

## 5. Plan de implementación

### Fase 0 — Pre-requisitos (antes del primer módulo de negocio)

1. Implementar las 3 capas de defensa.
2. Implementar tests de aislamiento.
3. Activar tests en CI como bloqueantes.

**Hasta que las 3 capas estén funcionando con tests pasando, NO se codea ningún módulo de negocio.**

### Fase 1 — Capa de Aplicación (`TenantContext`)

`apps/api/src/common/tenant/tenant-context.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
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
      throw new Error('TenantContext not initialized — request without tenant scope');
    }
    return store.tenantId;
  }

  get userId(): string {
    const store = this.als.getStore();
    if (!store) throw new Error('TenantContext not initialized');
    return store.userId;
  }
}
```

`apps/api/src/common/tenant/tenant-context.interceptor.ts`:

```typescript
import { CallHandler, ExecutionContext, Injectable, NestInterceptor, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContext } from './tenant-context.service';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContext) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user; // populated by JwtAuthGuard
    if (!user?.tenantId || !user?.id) {
      throw new UnauthorizedException('Missing tenant scope in JWT');
    }
    return new Observable((subscriber) => {
      this.tenantContext.run(
        { tenantId: user.tenantId, userId: user.id },
        () => {
          next.handle().subscribe(subscriber);
        },
      );
    });
  }
}
```

### Fase 2 — Capa de ORM (Prisma `$extends`)

`apps/api/src/common/prisma/prisma.service.ts`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../tenant/tenant-context.service';

// Modelos por-tenant: ampliar a medida que se agregan tablas con tenantId.
const TENANT_SCOPED_MODELS = ['AuditLog'] as const;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private readonly tenantContext: TenantContext) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // Cliente extendido que auto-inyecta tenantId en queries y setea RLS por transacción.
  scoped() {
    const tenantId = this.tenantContext.tenantId;

    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!TENANT_SCOPED_MODELS.includes(model as never)) {
              return query(args);
            }

            // Operaciones de lectura: forzar where: { tenantId }
            if (['findUnique', 'findFirst', 'findMany', 'count', 'aggregate'].includes(operation)) {
              args.where = { ...args.where, tenantId };
            }
            // Operaciones de escritura: forzar tenantId en data
            if (['create', 'createMany'].includes(operation)) {
              if (Array.isArray(args.data)) {
                args.data = args.data.map((d: object) => ({ ...d, tenantId }));
              } else {
                args.data = { ...args.data, tenantId };
              }
            }
            // updateMany / deleteMany: forzar where
            if (['updateMany', 'deleteMany'].includes(operation)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
        },
      },
    });
  }

  // Helper para envolver una transacción con SET LOCAL app.tenant_id (activa RLS).
  async withRlsTransaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    const tenantId = this.tenantContext.tenantId;
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
      return fn(tx as unknown as PrismaClient);
    });
  }
}
```

> ⚠️ **Importante**: el `SET LOCAL app.tenant_id` con interpolación se hace con valor pre-validado de un UUID. NO aceptar UUIDs sin validar — usar `class-validator` con `@IsUUID()`.

### Fase 3 — Capa de Base de Datos (PostgreSQL RLS)

Migración SQL que se aplica a TODA tabla por-tenant. Ejemplo para `audit_logs`:

```sql
-- migrations/<timestamp>_enable_rls/migration.sql

-- 1. Activar RLS en la tabla
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Forzar RLS incluso para el owner (impide bypass accidental)
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- 3. Política: solo filas del tenant actual son visibles/modificables
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 4. Crear rol de aplicación que NO puede bypassear RLS
-- (el role superuser SÍ puede bypassear; en producción, la app NUNCA conecta como superuser)
-- Asumiendo que el rol "taller_app" ya existe:
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO taller_app;
```

Este patrón se replica para `subscriptions`, `user_tenants` y todas las tablas por-tenant que se agreguen.

> 💡 **Tip**: crear una helper migration que reciba el nombre de tabla y genere las 4 sentencias automáticamente. Reduce el riesgo de olvidar `FORCE ROW LEVEL SECURITY` (que es el detalle que más se olvida).

### Fase 4 — Tests obligatorios de aislamiento

`apps/api/test/multi-tenant-isolation.e2e-spec.ts` (estructura):

```typescript
describe('Multi-tenant isolation (RLS + Prisma extension)', () => {
  let app: INestApplication;
  let tenantA: Tenant;
  let tenantB: Tenant;

  beforeAll(async () => {
    app = await createTestApp();
    tenantA = await seedTenant({ slug: 'taller-a' });
    tenantB = await seedTenant({ slug: 'taller-b' });
    // Crear datos en ambos tenants
    await seedAuditLog({ tenantId: tenantA.id, action: 'login' });
    await seedAuditLog({ tenantId: tenantB.id, action: 'login' });
  });

  it('Tenant A solo ve sus propios audit logs', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${jwtFor(tenantA)}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].tenantId).toBe(tenantA.id);
  });

  it('Tenant A NO puede leer audit logs de tenant B aunque pase el id', async () => {
    const tenantBLog = await prisma.auditLog.findFirst({
      where: { tenantId: tenantB.id },
    });

    const response = await request(app.getHttpServer())
      .get(`/audit-logs/${tenantBLog!.id}`)
      .set('Authorization', `Bearer ${jwtFor(tenantA)}`)
      .expect(404); // no 403 — desde la perspectiva de A, ese log no existe
  });

  it('RLS bloquea queries crudas que omiten tenant_id', async () => {
    // Conectar como rol de aplicación, sin SET app.tenant_id → no debe ver nada
    const rawConn = await getAppRoleConnection();
    const result = await rawConn.query('SELECT * FROM audit_logs');
    expect(result.rows).toHaveLength(0);
  });
});
```

Estos tests son **bloqueantes en CI**. Si fallan, no se mergea.

---

## 6. Migración del schema actual

Acción inmediata sobre `apps/api/prisma/schema.prisma`:

1. Agregar comentario al inicio explicitando la estrategia.
2. Asegurar que TODA tabla por-tenant tenga índice `[tenantId, ...]`.
3. Crear migración SQL que active RLS en `audit_logs`, `user_tenants`, `subscriptions`.

**Nota sobre `users`**: el modelo actual tiene `User` global (sin `tenantId`) y `UserTenant` como tabla pivote. Esto es intencional para soportar el caso de un usuario que pertenece a varios tenants (multi-membership). Las queries de `User` por sí solas NO son por-tenant; las queries de `UserTenant` SÍ. Mantener esta distinción.

---

## 7. Referencias

- Doc legacy descartada: `documentacion_taller_mecanico/03_arquitectura_multi_tenant.md`
- Doc legacy parcialmente descartada: `documentacion_taller_mecanico/41_modelos_datos.md` (la sección de schema-per-tenant es obsoleta)
- Tests de referencia: `documentacion_taller_mecanico/50a_testing_multi_tenancy.md` (los tests descritos ahí siguen siendo válidos, adaptarlos al patrón shared-schema + RLS)
- PostgreSQL RLS: https://www.postgresql.org/docs/15/ddl-rowsecurity.html
- Prisma `$extends`: https://www.prisma.io/docs/orm/prisma-client/client-extensions

---

## 8. Checklist de aceptación

Antes de mergear el primer PR de un módulo de negocio:

- [ ] `TenantContext` implementado y testeado
- [ ] `TenantContextInterceptor` registrado globalmente en `AppModule`
- [ ] `PrismaService.scoped()` implementado y testeado
- [ ] `PrismaService.withRlsTransaction()` implementado y testeado
- [ ] RLS activado en `audit_logs`, `user_tenants`, `subscriptions`
- [ ] Rol `taller_app` creado (no superuser)
- [ ] Tests de aislamiento implementados y pasando en CI
- [ ] Helper para generar migraciones RLS por tabla creado
- [ ] Convención documentada en README del repo

Mientras estos checks no estén en verde, **no se codea el primer módulo de negocio**.
