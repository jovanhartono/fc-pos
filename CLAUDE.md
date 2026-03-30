# CLAUDE.md

## Overview

**Fresclean** is a Bun monorepo for a laundry/cleaning service business. It consists of an API server and an admin web dashboard.

| Package | Name | Path | Description |
| --- | --- | --- | --- |
| Server | `@fresclean/api` | `packages/server` | Hono REST API with Drizzle ORM (PostgreSQL via Neon) |
| Web | `@fresclean/web` | `packages/web` | React 19 + Vite admin dashboard |

The web package consumes the server package as a workspace dependency (`@fresclean/api`) for shared types, Zod schemas, and typed RPC client.

## Quick Start

```bash
bun install            # Install all workspace dependencies
bun run dev            # Start both server (port 8000) and web (port 5173) concurrently
```

### Server only
```bash
cd packages/server
bun run --hot src/index.ts   # API with hot reload at http://localhost:8000/api
```

### Web only
```bash
cd packages/web
bun run dev                  # Vite dev server at http://localhost:5173
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
- **Validation:** Zod 4, `@hono/zod-validator`, `drizzle-zod`
- **Auth:** JWT (`hono/jwt`) with admin middleware on `/admin/*`
- **Storage:** AWS S3 (`@aws-sdk/client-s3`, presigned URLs)
- **Build:** `tsdown` bundles types/schemas/RPC for the web package

### Web (`packages/web`)
- **Framework:** React 19, Vite 8, TypeScript
- **Routing:** TanStack Router (file-based routes)
- **Data:** TanStack Query, TanStack Table
- **Forms:** react-hook-form + `@hookform/resolvers` (zodResolver)
- **State:** Zustand (persisted auth, UI dialogs/sheets)
- **UI:** shadcn (base-lyra style), `@base-ui/react`, Phosphor Icons, Tailwind CSS v4
- **Toasts:** Sonner (auto-handled by global mutation callbacks)

## Architecture

### Server Module Pattern

Domain logic follows: **Schema -> Repository -> Service -> Controller**

```
packages/server/src/modules/<domain>/
  *.schema.ts       # Zod schemas for request validation
  *.repository.ts   # Database queries (Drizzle)
  *.service.ts      # Business logic
  *.controller.ts   # Hono route handlers
```

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
packages/web/src/
  components/ui/       # shadcn components
  components/form/     # Shared form fields (CurrencyInput, PhoneNumberField)
  features/<domain>/   # Feature modules (components/, hooks/)
  lib/                 # api.ts, rpc.ts, query-options.ts, utils.ts
  routes/              # TanStack Router file-based routes
  shared/              # Shared Zod schemas
  stores/              # Zustand stores (auth, dialog, sheet, preferences)
```

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

### Pre-commit Hook

Husky runs `bunx biome check --write --staged` before every commit.

### Key Rules

- Explicit types for function params/returns when they enhance clarity
- `unknown` over `any`; `const` over `let`; never `var`
- Arrow functions for callbacks; `for...of` over `.forEach()`
- `async/await` over promise chains
- No `console.log`, `debugger`, or `alert` in production code
- Early returns over nested conditionals

## Common Tasks

### Adding a New Admin Endpoint

1. Create module files in `src/modules/<domain>/` (schema, repository, service, controller)
2. Create route file in `src/routes/admin/<domain>.ts`
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

## Detailed Standards

@AGENTS.md
@packages/server/AGENTS.md
@packages/web/AGENTS.md
