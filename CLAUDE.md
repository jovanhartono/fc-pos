# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Fresclean** is a Bun monorepo for a laundry/cleaning service business. It consists of an API server and an admin web dashboard.

| Package | Name | Path | Description |
| --- | --- | --- | --- |
| Server | `@fresclean/api` | `packages/server` | Hono REST API with Drizzle ORM (PostgreSQL via Neon) |
| Web | `@fresclean/web` | `apps/web` | React 19 + Vite admin dashboard |

The web package consumes the server package as a workspace dependency (`@fresclean/api`) for shared types, Zod schemas, and typed RPC client.

## Quick Start

```bash
bun install            # Install all workspace dependencies
bun run dev            # Turbo: build API types, then start server (8000) + web (5173)
bun run build          # Turbo: build all packages (cached)
bun run lint           # Turbo: lint all packages (cached)
bun run type-check     # Turbo: type-check all packages (cached)
```

### Server only
```bash
cd packages/server
bun run dev                  # API with hot reload (port 8000) + tsdown --watch for type exports
```

### Web only
```bash
cd apps/web
bun run dev                  # Vite dev server at http://localhost:5173
bun run build               # TypeScript check + Vite production build
bun run type-check          # TypeScript check only (also regenerates routes)
bun run generate-routes     # Regenerate TanStack Router route tree
```

## Environment Variables

The server reads from `process.env`:
- `DATABASE_URL_DEV` / `DATABASE_URL_PROD` - Neon PostgreSQL connection strings
- `JWT_SECRET` - Secret key for JWT authentication

## Tech Stack

### Server (`packages/server`)
- **Runtime:** Bun
- **HTTP:** Hono 4 (base path `/api`, CORS for localhost:5173 and :4173)
- **Database:** Drizzle ORM + `@neondatabase/serverless` (PostgreSQL)
- **Validation:** Zod 4, `@hono/zod-validator`
- **Auth:** JWT (`hono/jwt`) with admin middleware on `/admin/*`
- **Storage:** AWS S3 (`@aws-sdk/client-s3`, presigned URLs)
- **Build:** `tsdown` bundles types/schemas/RPC for the web package; Turborepo orchestrates cross-package builds

### Web (`apps/web`)
- **Framework:** React 19, Vite 8, TypeScript
- **Routing:** TanStack Router (file-based routes)
- **Data:** TanStack Query, TanStack Table
- **Forms:** react-hook-form + `@hookform/resolvers` (zodResolver)
- **State:** Zustand (persisted auth, UI dialogs/sheets, transaction preferences)
- **UI:** shadcn (base-lyra style), `@base-ui/react`, Phosphor Icons, Tailwind CSS v4
- **Toasts:** Sonner (auto-handled by global mutation callbacks)

### Monorepo Tooling
- **Turborepo** for task orchestration (`turbo.json`): `build`, `dev`, `lint`, `type-check`
- Pipeline topology: `api#build` (tsdown) runs before any web task via `^build` dependency
- Local caching enabled; no remote caching

## Architecture

### Server Module Pattern

Domain logic follows a 3-layer pattern: **Route -> Service -> Repository**

```
packages/server/src/modules/<domain>/
  *.schema.ts       # Zod schemas for request validation
  *.repository.ts   # Database queries (Drizzle) — insertX, findX, updateXById, listX, deleteXById
  *.service.ts      # Business logic + orchestration — createX, getX, updateX, deleteX
```

Routes (`src/routes/`) are thin HTTP handlers that call services directly.

Modules: `campaigns`, `categories`, `customers`, `orders`, `order-service-images`, `payment-methods`, `products`, `services`, `stores`, `users`

### Server Route Structure

```
src/
  app.ts            # Hono app instance, CORS, logger middleware
  index.ts          # Route mounting, global error handler, AppType export
  routes/
    auth.ts         # Authentication endpoints
    admin/          # JWT-protected admin endpoints (one file per domain)
      index.ts      # Mounts all admin sub-routes
    public/         # Public endpoints
      index.ts
```

All admin routes are protected by `adminMiddleware` applied to `/admin/*`.

### API Response Format

Use helpers from `src/utils/http.ts`:

```ts
success(data, message?, meta?)  // { success: true, data, message?, meta? }
failure(message, errors?)       // { success: false, message, errors? }
```

The global `onError` handler maps PostgreSQL error codes to HTTP status codes (23505 -> 409 Conflict, etc.).

### RPC / Type Sharing

The server exports `AppType` from `src/index.ts`. The web app uses Hono's `hc<AppType>()` client for fully typed API calls.

Server package exports (via `tsdown` build into `dist/`):
- `@fresclean/api/rpc` - Typed Hono client helper
- `@fresclean/api/schema` - Shared Zod schemas
- `@fresclean/api/types` - Shared TypeScript types

### Web Structure

```
apps/web/src/
  components/ui/       # shadcn components
  components/form/     # Shared form fields (CurrencyInput, PhoneNumberField)
  features/<domain>/   # Feature modules (components/, hooks/)
  hooks/               # Shared hooks (use-mobile.ts)
  lib/                 # api.ts, rpc.ts, query-options.ts, status.ts, utils.ts
  routes/              # TanStack Router file-based routes
  shared/              # Shared Zod schemas, utils
  stores/              # Zustand stores (auth, dialog, sheet, transaction-preferences)
```

### UI Gotchas

- Base UI `PopoverTrigger render={<div/>}` requires `nativeButton={false}` or it warns at runtime.
- Biome a11y: `role="button"` on span/div is disallowed (use a real `<button>`); `role="combobox"` requires `aria-expanded`.
- Base UI `Select` inside a `Popover`: items register on first Select open, so `SelectValue` shows the raw `value` string until then. Use function-child mapper `<SelectValue>{(v) => label(v)}</SelectValue>` or swap to `Combobox` (which keeps label via `items` prop).

## Database

### Drizzle Commands

All run from `packages/server`:

```bash
bun run generate:dev     # Generate migration files
bun run migrate:dev      # Apply migrations
bun run push:dev         # Push schema directly (no migration files)
bun run pull:dev         # Pull schema from database
bun run seed:dev         # Seed database with test data
```

Replace `:dev` with `:prod` for production. Each uses its own config (`drizzle-dev.config.ts` / `drizzle-prod.config.ts`).

Schema is defined in `packages/server/src/db/schema.ts`. Database connection is in `packages/server/src/db/index.ts`.

## Code Quality

### Linting & Formatting

Uses **Ultracite** (Biome preset):

```bash
bun x ultracite fix      # Auto-fix formatting and lint issues
bun x ultracite check    # Check without fixing
```

Always run from the repo root — running from `apps/web` or `packages/server` mangles paths.

### Pre-commit Hook

Husky runs `bunx biome check --write --staged --no-errors-on-unmatched` before every commit.

### Key Rules

- Explicit types for function params/returns when they enhance clarity
- `unknown` over `any`; `const` over `let`; never `var`
- Arrow functions for callbacks; `for...of` over `.forEach()`
- `async/await` over promise chains
- No `console.log`, `debugger`, or `alert` in production code
- Early returns over nested conditionals

## Common Tasks

### Adding a New Admin Endpoint

1. Create module files in `src/modules/<domain>/` (schema, repository, service)
2. Create route file in `src/routes/admin/<domain>.ts` — routes call services directly
3. Mount the route in `src/routes/admin/index.ts`
4. Admin middleware is already applied to `/admin/*`

### Adding a Schema Change

1. Edit `packages/server/src/db/schema.ts`
2. Run `bun run generate:dev` to create migration
3. Run `bun run migrate:dev` to apply
4. Update Zod schemas in the relevant module if needed

### Building Server Types for Web

The server dev script runs `tsdown --watch` alongside the server. For a one-off build:
```bash
cd packages/server && bunx tsdown
```

## v1 Scope Source of Truth

- `docs/core-implementation-plan.md` — groups A–G, locked scope for v1
- `docs/deferred-actions.md` — 19 items explicitly deferred (D-1..D-19); do not re-propose unless trigger hit
- `docs/production-readiness-audit.md` — original findings + rationale

## Detailed Standards

@packages/server/AGENTS.md
@apps/web/AGENTS.md
