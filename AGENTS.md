# Agents Code Review Rules

These rules guide automated and human code review for this monorepo.

## Stack

- Monorepo: pnpm + Turborepo
- Backend: NestJS 10, TypeScript, Prisma 6, PostgreSQL 15
- Frontend: React 19, Vite, TypeScript, MUI, Tailwind, Redux Toolkit
- Infra: Redis, RabbitMQ
- Tests: Jest + ts-jest (API), Vitest + Testing Library (Web), Supertest (e2e)

## TypeScript

- `strictNullChecks` and `noImplicitAny` are enforced — never bypass.
- Avoid `any`. If unavoidable, isolate it at the module boundary and document why.
- Prefer `interface` for object shapes consumed across modules; use `type` for unions, intersections, and utility types.
- Use `import type` for type-only imports in Web (`verbatimModuleSyntax` is on).
- Use `const`. Use `let` only for variables that must be reassigned. Never `var`.
- Always use explicit return types on exported functions and class methods.

## NestJS Conventions

- One feature, one module. Modules expose providers explicitly via `exports`.
- Inject dependencies via constructor; never `new` a service inside another service.
- Cross-cutting concerns (logging, tenant scope, validation) belong in interceptors, guards, or pipes, not handlers.
- Use `class-validator` + `class-transformer` for DTOs. Validate UUIDs with `@IsUUID()`.
- Throw NestJS exceptions (`UnauthorizedException`, `NotFoundException`, etc.) — never plain `Error` for HTTP-mapped flows.

## Multi-Tenancy Rules (non-negotiable)

These rules implement the three-layer defense documented in `docs/adr/0001-multi-tenancy-strategy.md`.

- Every tenant-scoped table MUST have:
  - `tenantId` column of type `UUID NOT NULL` with FK to `tenants.id`.
  - A composite index that begins with `tenantId`.
  - PostgreSQL Row-Level Security enabled and forced, with a `tenant_isolation` policy filtering by `current_setting('app.tenant_id')::uuid`.
- The application layer reads tenant scope from `req.user` populated upstream (the `TenantContextInterceptor` is the single entry point).
- The application connects to PostgreSQL with role `taller_app` (`NOSUPERUSER NOBYPASSRLS`). Without `SET LOCAL app.tenant_id`, RLS returns zero rows for every tenant-scoped table — including ORM-generated queries.
- Every query (ORM or raw) that touches a **tenant-scoped** table MUST run inside `withRlsTransaction()`. The helper sets `app.tenant_id` for the transaction; without it the query returns nothing in production.
- `prisma.scoped()` remains the canonical query builder for tenant-scoped tables: it auto-injects `tenantId` for `create*` and adds defense-in-depth filtering for read/update/delete operations. It MUST be called from within `withRlsTransaction()`.
- **Tenant-scoped vs global models — authoritative source is `TENANT_SCOPED_MODELS` in `apps/api/src/common/prisma/prisma.service.ts`**:
  - **Tenant-scoped** (have `tenantId` column, RLS-enabled, MUST use `prisma.scoped()` inside `withRlsTransaction()`): `UserTenant`, `Subscription`, `AuditLog`. Any future model added to `TENANT_SCOPED_MODELS` joins this list.
  - **Global** (no `tenantId` column, no RLS, accessed via plain `prisma.<model>` — never through `prisma.scoped()`): `Tenant`, `User`, `EmailVerification`, `RefreshToken`. Services that only touch global models (e.g. `RefreshTokenService`, `EmailVerificationService`) do NOT need `withRlsTransaction()`. Reviewers MUST NOT flag them as missing the wrapper.
- **Bootstrap exception (signup only)**: The signup path creates the tenant itself, so it executes BEFORE any tenant context exists. It is the ONLY code path allowed to write to tenant-scoped tables outside `withRlsTransaction()`/`prisma.scoped()`, and it MUST follow this two-phase pattern inside a single atomic `prisma.$transaction`:
  1. Phase 1 — create global rows (`Tenant`, `User`, `EmailVerification`) directly on the transaction client.
  2. Phase 2 — within the same transaction, run ``tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '<new-tenant-id>'`)`` and then create tenant-scoped rows (`UserTenant`, `Subscription`) directly on the transaction client. RLS is now satisfied because `app.tenant_id` is set.
  Reviewers MUST recognize this pattern in `apps/api/src/modules/auth/auth.service.ts#signup` and NOT flag it as a missing `prisma.scoped()` / `withRlsTransaction()` call.
- The application database role MUST NOT have `SUPERUSER` or `BYPASSRLS`.
- Cross-tenant access attempts MUST return 404, never 403, to avoid leaking resource existence.
- Global models (e.g. `User`) are not auto-filtered. Only models in the explicit `TENANT_SCOPED_MODELS` list are filtered.

### RLS auth-bootstrap exception

The `auth_lookup` policy on `user_tenants` allows SELECT when `current_setting('app.tenant_id', true)` is NULL or empty. This is REQUIRED for the login flow: before tenant context is established, the auth service must look up the user's tenant association by `user_id` to build the JWT claims.

- **Scope**: SELECT-only — no INSERT/UPDATE/DELETE bypass.
- **Risk acceptance**: Queries that forget to set `app.tenant_id` will see all `user_tenants` rows. This is acceptable because (a) it's read-only, (b) the only queries that legitimately run without tenant context are auth lookups, and (c) RLS still blocks all other tenant-scoped tables when context is missing.
- **Migration**: `apps/api/prisma/migrations/20260526035800_fix_rls_empty_tenant_id/migration.sql`.

## Authentication

- Access tokens are returned in the JSON response body; refresh tokens are set as `httpOnly` cookies. Never expose refresh tokens in response bodies.
- The API is secure-by-default via a global `APP_GUARD` (JWT). Opt out individual routes with the `@Public()` decorator. Public routes: signup, login, verify-email, refresh.
- `GET /auth/me` returns the authenticated user's identity. Use `@CurrentUser()` to inject the user into handler parameters.
- `GET /auth/verify-email?token=<token>` verifies email ownership. The token is a URL query parameter, not a path segment.
- Frontend uses `PublicRoute` and `PrivateRoute` route guards. Unauthenticated users are redirected to `/login`; authenticated users are redirected away from public-only pages.
- The shared `httpClient` (Axios instance) includes a refresh+retry interceptor: on 401, it attempts a token refresh and replays the failed request once.

## Prisma

- Schema lives in `apps/api/prisma/schema.prisma`. Migrations live alongside.
- Run `prisma migrate dev --name <descriptive>` for schema changes; never edit existing migrations.
- Add a composite index `[tenantId, ...]` on every tenant-scoped table.
- Map TypeScript field names to snake_case columns with `@map`/`@@map`.

## Testing

- New behavior ships with a failing test first (TDD). The test that fails before the implementation is the proof the implementation is needed.
- Unit tests live next to source as `*.spec.ts` (API) or `*.test.{ts,tsx}` (Web).
- E2E tests live in `apps/api/test/*.e2e-spec.ts` and run via `pnpm --filter @taller-saas/api test:e2e`.
- E2E suites run with `maxWorkers: 1` (sequential). Rationale: suites TRUNCATE shared tables between tests; concurrent workers cause deadlocks and flaky failures. Sequential execution (~30s total) is acceptable.
- Mock external boundaries (DB, HTTP) at the closest layer, not deep inside the system under test.
- A test must fail meaningfully before passing. If a test is added green, it provides no protection — flag it.

## Commits and PRs

- Use Conventional Commits: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`.
- Subject in imperative mood, present tense, lowercase after the type. Maximum 72 characters.
- One logical concern per commit. If a commit touches unrelated areas, split it.
- Never include AI-attribution trailers (`Co-Authored-By` for assistants, `Generated by …`, etc.).
- Pull requests must stay under 400 lines of changed code. Larger work splits into chained PRs (each PR based on the previous one) or, exceptionally, a single PR labeled `size:exception` with explicit maintainer approval.
- Every PR must include: scope summary, files touched, manual or automated verification performed, risks.

## Security

- Never commit secrets. `.env` is gitignored; use `.env.example` for templates.
- Validate every external input with DTOs/schemas before it reaches business logic.
- Parameterize SQL. The only acceptable raw SQL is in migrations and in `withRlsTransaction()` setup.
- Never log full JWTs, passwords, or PII.

## Code Style

- Prettier formatting is mandatory. Run `pnpm lint` before requesting review.
- Files: kebab-case. Classes/Interfaces: PascalCase. Functions/variables: camelCase. Constants: UPPER_SNAKE_CASE only for module-level immutable values.
- Comments explain *why*, not *what*. If a comment describes the code, rewrite the code.

## Out of Scope for Review

- Generated files (`dist/`, `coverage/`, Prisma client output, lockfiles).
- Local planning artifacts under `openspec/` (gitignored).

## Reviewer Output Contract

- Emit the verdict token in English exactly: `STATUS: PASSED` or `STATUS: FAILED`.
- Never translate, reword, or localize the verdict token. The literal English string is required by the tooling.
