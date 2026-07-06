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
```

## Database

```sh
bun run push:dev     # Push schema directly to dev DB — the workflow this repo uses
bun run pull:dev     # Pull schema from dev DB
bun run seed:dev     # Seed dev DB with test data
```

Replace `:dev` with `:prod` for production; each uses its own config (`drizzle-dev.config.ts` / `drizzle-prod.config.ts`). Schema lives in `src/db/schema.ts`.

`generate:*` / `migrate:*` scripts exist but are **not used** — there is no migration journal.

## Environment Variables

Read from `process.env` (`.env` auto-loads in this package):

- `DATABASE_URL_DEV` / `DATABASE_URL_PROD` — Neon PostgreSQL connection strings
- `JWT_SECRET` — secret key for JWT authentication

## Structure

Domain logic follows a 3-layer module pattern (`src/modules/<domain>/`): `*.schema.ts` → `*.repository.ts` → `*.service.ts`. Routes (`src/routes/`) are thin HTTP handlers; admin routes under `/admin/*` are JWT-protected. Conventions: see [`AGENTS.md`](AGENTS.md).
