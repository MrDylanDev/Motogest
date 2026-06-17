# @taller-saas/api

NestJS 10 backend for the Taller SaaS platform. Handles authentication, multi-tenant data access (Prisma + PostgreSQL with RLS), and business logic.

## Prerequisites

- Node.js 20+
- pnpm 11+
- Docker (provides PostgreSQL 15 and Redis via `docker compose`)

## Setup

All commands run from the **monorepo root** (`Plataforma-SaaS/`).

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure
docker compose up -d

# 3. Create your env file
cp .env.example .env
# Edit .env if needed. Key variables:
#   DATABASE_URL    - PostgreSQL connection (owner role for migrations)
#   REDIS_URL       - Redis connection
#   JWT_SECRET      - Secret for signing tokens
#   JWT_EXPIRATION  - Access token TTL (default: 15m)

# 4. Generate Prisma client and run migrations
pnpm --filter @taller-saas/api prisma:generate
pnpm --filter @taller-saas/api prisma:migrate
```

## Development

```bash
pnpm --filter @taller-saas/api dev
```

The API starts on `http://localhost:3000` by default.

## Testing

```bash
# Unit tests
pnpm --filter @taller-saas/api test

# E2E tests (requires running postgres + redis)
pnpm --filter @taller-saas/api test:e2e

# Coverage
pnpm --filter @taller-saas/api test:cov
```

## Linting

```bash
pnpm --filter @taller-saas/api lint
```

## Full local CI

For a complete CI replica (lint, test, build, e2e) that mirrors the GitHub Actions pipeline:

```bash
pnpm ci:local
```

See [docs/local-ci.md](../../docs/local-ci.md) for details on what runs and troubleshooting.
