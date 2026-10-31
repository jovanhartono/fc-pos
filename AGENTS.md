# Repo-Wide Standards

Guidance for coding agents working anywhere in this repository. `CLAUDE.md` symlinks here.

## Overview

**Fresclean** is a Bun monorepo for a multi-store cleaning, restoration, and repair shop — customers drop off footwear, bags, hats, and luggage, the shop treats them, they collect. It is **not** a laundry: the unit of work is an individual **Item** tracked through named treatments, not a load of garments. An API server (`@fresclean/api`) plus an admin web dashboard (`@fresclean/web`) that consumes it as a workspace dependency for shared types, Zod schemas, and the typed RPC client.

See `GLOSSARY.md` for the domain vocabulary — **Item**, **Order**, **OrderService** and the rest have precise meanings here, and using them loosely is the most common way to get the model wrong.

## Commands

```bash
bun run dev          # turbo dev — server (hot reload + tsdown --watch) and web (vite)
bun run test         # turbo test — bun test in each package
bun run type-check   # turbo type-check — web runs generate-routes first
bun x ultracite check
```

A change is done when the last three pass from the repo root. The pre-commit hook only runs `ultracite fix` on staged files.

**Dependency pins:** `bun update --latest` downgrades packages on an `rc` dist-tag. drizzle-orm/drizzle-kit stay pinned at `1.0.0-rc.5` and Biome at `2.5.15` (root `catalog`); bump them by hand, on purpose.

## Environment Variables

The server reads from `process.env`:
- `DATABASE_URL` - Neon PostgreSQL connection string, set per Vercel environment (Production/Preview/Development)
- `STORAGE_PREFIX` - `dev/` or `prod/`, set per Vercel environment alongside `DATABASE_URL`
- `JWT_SECRET` - Secret key for JWT authentication
- `CDN_BASE_URL` - Public base for stored photo keys: `https://cdn.fresclean.id` in Production, `https://cdn-dev.fresclean.id` in Preview
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` / `S3_REGION` (`auto`) / `S3_ENDPOINT` - the R2 bucket for photos, set per Vercel environment. Without `S3_ENDPOINT`, Bun's client talks to AWS and every upload fails
- `CRON_SECRET` - Bearer secret Vercel cron sends to `/api/internal/*`; unset answers 401 to everyone
- `SENTRY_DSN` - Optional; unset turns error reporting off
- `PAYMENT_GATEWAY` - `midtrans` or `doku`, the gateway new Gateway charges use; unset turns online payment off (ADR-0026)
- `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION` / `DOKU_CLIENT_ID`, `DOKU_SECRET_KEY`, `DOKU_IS_PRODUCTION` - gateway credentials, sandbox unless `*_IS_PRODUCTION=true`
- `PUBLIC_WEB_URL` - Optional, defaults to `https://pos.fresclean.id`; the Track page and webhook URLs sent to the gateway
- `PAYMENT_GATEWAY_MOCK` - `true` swaps the gateway's outbound calls for a mock page at `/api/mock-gateway/<reference>` whose buttons send signed notifications to the real webhook. Ignored on Production. Set `PUBLIC_WEB_URL` to the local origin (e.g. `http://localhost:5173`) and any non-empty keys for the gateway in use

Each gateway dashboard's notification URL is `https://pos.fresclean.id/api/webhooks/payments/midtrans` or `…/doku`.

Laptop-only, for the drizzle CLI: `DATABASE_URL_DEV` / `DATABASE_URL_PROD`.

## Deployment Regions

Both services run in Singapore — `ap-southeast-1`, Vercel region `sin1` — as does Neon. Photos live in Cloudflare R2 (APAC), served via `https://cdn.fresclean.id` (moved off S3 and CloudFront on 2026-10-28).

Each environment has its own bucket, `fresclean-prod` and `fresclean-dev`, and an R2 token that reaches only that bucket, so a laptop can't touch a Complaint's evidence. Keys still carry the environment that wrote them: `dev/orders/…` or `prod/orders/…`, from `STORAGE_ENV_PREFIX` in `src/utils/s3.ts`. It reads `STORAGE_PREFIX`, set per Vercel environment alongside `DATABASE_URL` — the two must agree, or the photo sweep judges one environment's bucket against the other's database. Seed rows point at `seed/` keys that were never uploaded, so seeded photos show broken.

Indonesian ISPs block `*.r2.dev`, so the bucket's r2.dev URL stays off; photos go through the custom domains and uploads through `<account>.r2.cloudflarestorage.com`. Cloudflare keeps a photo for a year at the edge and in the browser (`immutable`), since a key's photo never changes; errors aren't cached.

The API's region is pinned by the top-level `"regions": ["sin1"]` in `vercel.json` (`services.*` takes no `regions` key; without it Vercel falls back to `iad1`, a cross-region hop to Neon on every order).

The API is a plain Bun function, not a Docker container: a container bills its memory until 5 quiet minutes pass, which at the counter's pace meant every open hour.

## Edge protection

Vercel WAF rate limit rules to keep, since the API scales to zero and an
in-process limiter would reset with it — no in-process limiter is by design:

- `/api/auth/login` — 10 requests per 60s per IP, deny
- `/api/public/*` — 60 requests per 60s per IP, deny (Pro plan)
- `/api/health` — 30 requests per 60s per IP, deny (Pro plan) — it opens a database connection per hit

## Scheduled Jobs

`vercel.json` `crons` → HTTP GET to the production URL, routed through the `/api/(.*)` rewrite to the API. **Schedules are UTC only**, so a Jakarta time is written 7 hours earlier: `0 20 * * *` is 03:00 Jakarta.

Vercel may skip or repeat a run; both jobs are safe either way.

Cron log lines carry `region=iad1`: that is where Vercel's scheduler enters, not where the job runs. The `(sin1)` at the end of each job's own line is `VERCEL_REGION` from inside the function (checked on prod 2026-10-26).

- `/api/internal/photo-sweep` — deletes photos no order points at, left behind when the counter uploads and then abandons a batch. Checks only its own environment's prefix and skips files under 24h old. Its R2 token needs Object Read & Write, which includes listing, or every run fails with AccessDenied.
- `/api/internal/close-open-shifts` — closes yesterday's Auto-closed Shifts at 00:00 Jakarta (ADR-0025). A skipped run locks nobody out: the next Clock in or Clock out closes it the same way.

## RPC / Type Sharing

The server exports `AppType` from `src/index.ts`. The web app uses Hono's `hc<AppType>()` client for fully typed API calls.

## Linting & Formatting

**Ultracite** (Biome preset): `bun x ultracite fix` / `check`. Always from the repo root — running from `apps/web` or `packages/server` mangles paths. Rules switched off in `biome.jsonc` carry their reason there; read it before turning one back on.

## Domain, Decisions, Scope (read first)

- `GLOSSARY.md` — what each term means and the words to avoid. Use these terms exactly in code, copy, comments and PRs; don't coin synonyms.
- `docs/adr/` — hard-to-reverse choices and the business rules behind the glossary's terms. Check for an ADR before changing a rule it covers.
- `TODO.md` — the task list, plus the v1 deferred rows and what each one waits for.

Package standards load when working under their directory: `packages/server/AGENTS.md`, `apps/web/AGENTS.md`.

## Agent skills

### Issue tracker

GitHub Issues on `jovanhartono/fc-pos`, via `gh`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout — `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
