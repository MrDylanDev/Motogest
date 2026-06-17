# @taller-saas/web

React 19 frontend for the Taller SaaS platform. Built with Vite, MUI, Tailwind, Redux Toolkit, react-hook-form, and zod.

## Prerequisites

- Node.js 20+
- pnpm 11+
- The API (`@taller-saas/api`) running locally for full functionality

## Setup

All commands run from the **monorepo root** (`Plataforma-SaaS/`).

```bash
# 1. Install dependencies
pnpm install

# 2. Create your env file (if the app uses one)
# The web app reads VITE_API_URL from environment.
# Default: http://localhost:3000

# 3. Build the shared package (required dependency)
pnpm --filter @taller-saas/shared build
```

## Development

```bash
pnpm --filter @taller-saas/web dev
```

The app starts on `http://localhost:5173` by default (Vite dev server).

## Testing

```bash
# Run tests
pnpm --filter @taller-saas/web test

# Watch mode
pnpm --filter @taller-saas/web test:watch
```

## Linting

```bash
pnpm --filter @taller-saas/web lint
```

## Full local CI

For a complete CI replica that mirrors the GitHub Actions pipeline:

```bash
pnpm ci:local
```

See [docs/local-ci.md](../../docs/local-ci.md) for details on what runs and troubleshooting.
