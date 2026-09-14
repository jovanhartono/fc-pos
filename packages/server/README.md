# @fresclean/api

REST API for Fresclean. Hono 4 on Bun, Drizzle ORM (PostgreSQL via Neon), Zod validation, JWT auth.

Also exports shared types, Zod schemas, and a typed RPC client for `@fresclean/web` (built with `tsdown` into `dist/`):

- `@fresclean/api/rpc` — typed Hono client helper
- `@fresclean/api/schema` — shared Zod schemas
- `@fresclean/api/types` — shared TypeScript types

## Commands

```sh
bun run dev          # API with hot reload (port 8000) + tsdown --watch
bun run build        # One-off type export build (tsdown)
bun run lint         # Biome check
bun run type-check   # TypeScript check
bun run test         # bun test --isolate (integration suites swap @/db for PGlite)
```

## Database

Schema lives in `src/db/schema.ts`; `drizzle/` is the committed, ordered migration ledger applied to every environment in the same order.

```sh
bun run generate --name=<short_snake_name>   # Write the delta for a schema.ts edit
bun run migrate:dev                          # Apply pending migrations to dev
bun run drift:dev                            # Read-only: how dev differs from schema.ts
bun run seed:dev                             # Seed dev DB with test data
```

Replace `:dev` with `:prod` for production; each uses its own config (`drizzle-dev.config.ts` / `drizzle-prod.config.ts`). `push:dev` is for throwaway prototyping only — anything kept goes through `generate`. The full workflow, the rename hints, and the prod checklist are in [`AGENTS.md`](AGENTS.md).

## Environment Variables

Read from `process.env` (`.env` auto-loads in this package):

- `DATABASE_URL` — Neon PostgreSQL connection string, set per Vercel environment
- `STORAGE_PREFIX` — `dev/` or `prod/`, set per Vercel environment alongside `DATABASE_URL`
- `JWT_SECRET` — secret key for JWT authentication
- `CDN_BASE_URL` — public base for stored photo keys
- `CRON_SECRET` — shared secret for `/api/internal/*`; unset means those endpoints answer 401
- `SENTRY_DSN` — optional; unset means `reportError` is a no-op

Laptop-only, for the drizzle CLI: `DATABASE_URL_DEV` / `DATABASE_URL_PROD`. See `.env.example`.

## Structure

Domain logic follows a 3-layer module pattern (`src/modules/<domain>/`): `*.schema.ts` → `*.repository.ts` → `*.service.ts`. Routes (`src/routes/`) are thin HTTP handlers; admin routes under `/admin/*` are JWT-protected. Conventions: see [`AGENTS.md`](AGENTS.md).
