# Server / API Standards

`@fresclean/api` — Hono + Drizzle + Zod on Bun. Repo-wide rules: `../../AGENTS.md`

## Conventions

- New admin endpoints: `src/routes/admin/` → mount in `src/routes/admin/index.ts`. `adminMiddleware` covers `/admin/*`.
- Domain logic in **modules** (`src/modules/<domain>/`): `*.schema.ts` → `*.repository.ts` → `*.service.ts`. Routes call services directly — no controller layer.
- **Naming**: Repository functions use DB verbs (`insertX`, `findX`, `updateXById`, `listX`, `deleteXById`). Service functions use domain verbs (`createX`, `getX`, `updateX`, `deleteX`).
- **Prepared statements**: Use Drizzle's `.prepare()` for hot-path queries (findById, auth lookups). See existing patterns in repositories and `utils/authorization.ts`.
- **Relational query `where`**: For `db.query.*.findMany()` / `findFirst()`, use Drizzle v2 object-based `where` syntax inline — `{ is_active: true }`, `{ stores: { store_id: 1 } }`, `OR`/`AND`/`NOT` keys, `undefined` to omit optional filters. Do **not** build a separate function that returns raw SQL via `{ RAW: () => ... }` — it produces "invalid reference to FROM-clause entry" errors because raw SQL references the original table, not the alias Drizzle uses internally. Reserve raw `eq`/`and`/`sql` for `db.select()`, `db.$count()`, `db.update()`, `db.delete()` which don't alias.
- Use `src/utils/http.ts` helpers (`success()`, `failure()`) for responses.
- Export types/schemas for web via package exports (`schema`, `rpc`, `types`) — no deep internal imports from `@fresclean/web`.
- **Date query params**: `dateStringSchema()` requires `YYYY-MM-DD` — never send `.toISOString()`. Used on shifts, reports, daily-report endpoints.
- **Timezone**: all `dayjs()` calls that compute day/week/month boundaries or format date strings must use `.tz("Asia/Jakarta")`. Bootstrap `utc` + `timezone` plugins at server entry. Use `src/utils/date.ts` helpers (`jakartaNow`, `jakartaDayStart`, `jakartaDayEnd`) — do NOT inline `dayjs().startOf("day")`. Reports module uses `AT TIME ZONE 'Asia/Jakarta'` in SQL; orders/repositories must match via dayjs TZ. Exempt: `modules/reports/report-range.util.ts` deliberately skips the dayjs helpers and computes bucket boundaries with fixed-offset arithmetic (WIB is UTC+7, no DST), so its JS bucket labels match Postgres' own `to_char(… AT TIME ZONE …)` bucketing exactly.

## Database

Schema lives in `src/db/schema.ts`; the connection in `src/db/index.ts`. Each environment has its own config (`drizzle-dev.config.ts` / `drizzle-prod.config.ts`) — swap `:dev` for `:prod` on any drizzle script.

`push:dev` (push the schema straight to the DB) is the workflow this repo uses. `generate:dev` / `migrate:dev` exist but are **not used** — `drizzle/dev/` has no migration journal, so `generate:dev` produces a misleading full-schema snapshot. If run by accident, delete the folder it creates.

### Adding a Schema Change

1. Edit `src/db/schema.ts`
2. Adding a constraint over live data? First count violating rows with a read-only query (`bun -e` with `process.env.DATABASE_URL_DEV`; `.env` auto-loads in `packages/server`)
3. Run `bun run push:dev` (diffs live DB against schema, applies delta)
   - Destructive deltas (drops) need a TTY to confirm — from an agent shell push errors out and piping `y` does not work. Apply the DDL directly via `bun -e` with idempotent statements (`IF EXISTS`), then verify via `information_schema.columns` / `pg_indexes`. Drop dependent CHECKs/indexes before the column, enum types after.
4. Verify CHECK constraints via `pg_constraint` — push applies them silently without printing diffs
5. Update Zod schemas in the relevant module if needed
