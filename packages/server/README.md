# @fresclean/api

The REST API behind Fresclean's POS, workshop and Customer Track page. Hono 4 on Bun, Drizzle ORM over Neon PostgreSQL, Zod validation, JWT auth with role permissions. It runs as a plain Bun function on Vercel in `sin1` (Singapore).

It also exports shared code for `@fresclean/web`, built with `tsdown` into `dist/`, so the web app gets typed API calls without codegen:

- `@fresclean/api/rpc`: typed Hono client helper (`hc<AppType>()`)
- `@fresclean/api/schema`: shared Zod schemas
- `@fresclean/api/rules`: business rules both sides need (e.g. which statuses are still in the workshop)
- `@fresclean/api/types`: shared TypeScript types

## What it serves

| Path | Who calls it | What for |
| --- | --- | --- |
| `/api/auth/*` | Staff | Login, JWT issue |
| `/api/admin/*` | Staff (JWT + role check) | Orders, Queue, Counter, Complaints, Shifts, Reports, catalog, Users |
| `/api/public/*` | Customers, no login | Track page: an Order by phone number + Pickup code, QRIS to pay it |
| `/api/webhooks/payments/*` | Midtrans / DOKU | Payment notifications, signature-checked |
| `/api/internal/*` | Vercel Cron (`CRON_SECRET`) | Photo sweep, closing forgotten Shifts, settling missed QRIS |
| `/api/mock-gateway/*` | Local dev only | Fake gateway page when `PAYMENT_GATEWAY_MOCK=true`; off on Production |
| `/api/health` | Uptime checks | Opens a database connection |

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

Read from `process.env` (`.env` auto-loads in this package; see `.env.example`):

- `DATABASE_URL`: Neon PostgreSQL connection string, set per Vercel environment
- `STORAGE_PREFIX`: `dev/` or `prod/`, must match the `DATABASE_URL` environment
- `JWT_SECRET`: secret key for JWT authentication
- `CDN_BASE_URL`: public base for stored photo keys
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` / `S3_REGION` / `S3_ENDPOINT`: the Cloudflare R2 bucket for photos. Without `S3_ENDPOINT`, uploads go to AWS and fail
- `CRON_SECRET`: shared secret for `/api/internal/*`; when unset, those endpoints answer 401
- `PAYMENT_GATEWAY`: `midtrans` or `doku`; when unset, online payment is off. Credentials for each gateway are listed in the root [`AGENTS.md`](../../AGENTS.md)
- `PUBLIC_WEB_URL`: optional, defaults to `https://pos.fresclean.id`; the Track page and webhook origin sent to the gateway
- `SENTRY_DSN`: optional; when unset, `reportError` does nothing

Laptop-only, for the drizzle CLI: `DATABASE_URL_DEV` / `DATABASE_URL_PROD`.

## Structure

Domain logic follows a 3-layer module pattern (`src/modules/<domain>/`): `*.schema.ts` → `*.repository.ts` → `*.service.ts`. Routes (`src/routes/`) are thin HTTP handlers. Conventions: see [`AGENTS.md`](AGENTS.md).
