# Repo-Wide Standards

Guidance for coding agents working anywhere in this repository. `CLAUDE.md` symlinks here.

## Overview

**Fresclean** is a Bun monorepo for a multi-store cleaning, restoration, and repair shop — customers drop off footwear, bags, hats, and luggage, the shop treats them, they collect. It is **not** a laundry: the unit of work is an individual **Item** tracked through named treatments, not a load of garments. An API server (`@fresclean/api`) plus an admin web dashboard (`@fresclean/web`) that consumes it as a workspace dependency for shared types, Zod schemas, and the typed RPC client.

See `CONTEXT.md` for the domain vocabulary — **Item**, **Order**, **OrderService** and the rest have precise meanings here, and using them loosely is the most common way to get the model wrong.

## Environment Variables

The server reads from `process.env`:
- `DATABASE_URL_DEV` / `DATABASE_URL_PROD` - Neon PostgreSQL connection strings
- `JWT_SECRET` - Secret key for JWT authentication
- `CDN_BASE_URL` - Public base for stored photo keys
- `CRON_SECRET` - Shared secret for `/api/internal/*`. Vercel sends it as `Authorization: Bearer …` on cron invocations. Unset means those endpoints answer 401 to everyone.

## Deployment Regions

Both services run in Singapore — `ap-southeast-1`, Vercel region `sin1` — as does Neon. Photos live in S3 `ap-southeast-3` (Jakarta), served via `https://cdn.fresclean.id`.

Dev and production share that bucket, so every key is namespaced by the environment that wrote it: `dev/orders/…` or `prod/orders/…`, from `STORAGE_ENV_PREFIX` in `src/utils/s3.ts`. It reads `NODE_ENV`, the same flag that picks the database in `src/db/index.ts` — the two must agree, or the photo sweep judges one environment's bucket against the other's database. Seed data has its own `seed/` prefix and is outside both.

The container region is set in **Vercel project settings**, not `vercel.json`: `services.*` there takes no `regions` key. Keeping it beside Neon is what makes an order commit a same-region round trip rather than a cross-region one.

## Scheduled Jobs

`vercel.json` `crons` → HTTP GET to the production URL, routed through the `/api/(.*)` rewrite to the container. **Schedules are UTC only**, so a Jakarta time is written 7 hours earlier: `0 20 * * *` is 03:00 Jakarta.

- `/api/internal/photo-sweep` — deletes order photos no order points at. The counter uploads a photo before the batch is confirmed, so an abandoned batch leaves the file behind with nothing filed against it. Compares its own environment's prefix to the database each run and ignores anything under 24h old. No per-run cap — a backlog clears in one pass. Delivery is best-effort: Vercel may skip or repeat a run, which is safe here. Needs `s3:ListBucket` on the bucket; the object-level rights the presign flow uses are not enough, and without it every run fails with AccessDenied.

## RPC / Type Sharing

The server exports `AppType` from `src/index.ts`. The web app uses Hono's `hc<AppType>()` client for fully typed API calls.

## Code Quality

### Linting & Formatting

Uses **Ultracite** (Biome preset):

```bash
bun x ultracite fix      # Auto-fix formatting and lint issues
bun x ultracite check    # Check without fixing
```

Always run from the repo root — running from `apps/web` or `packages/server` mangles paths.

## Domain & Decisions (read first)

- `CONTEXT.md` — domain glossary, relationships, flagged ambiguities. Use these terms exactly.
- `docs/adr/` — Architecture Decision Records. Hard-to-reverse choices with rationale.

## v1 Scope Source of Truth

- `TODO.md` — current lightweight task list when present
- `docs/archive/2026-04-28-v1-ship/` — historical v1-ship audits (overcomplexity, production-readiness, deferred D-1..D-19). Frozen reference; do not extend in place.

## Detailed Standards

Loaded automatically when working under their own directory, not before:

- `packages/server/AGENTS.md` — server/API standards
- `apps/web/AGENTS.md` — web standards

## Agent skills

### Issue tracker

GitHub issues on `jovanhartono/fc-pos` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`); only `wontfix` exists on the repo today. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root, created lazily by `/grill-with-docs`. See `docs/agents/domain.md`.
