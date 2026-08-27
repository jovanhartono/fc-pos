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

Schema lives in `src/db/schema.ts`; the connection in `src/db/index.ts`.

**Migrations are the workflow.** `./drizzle/` holds an ordered, committed
sequence of `<timestamp>_<name>/migration.sql`, applied to every environment in
the same order. The repo ran on `push` through early development and was
baselined onto migrations on 2026-08-27; `drizzle/20260827073115_baseline` is a
full snapshot of the schema as it stood then, recorded as applied without ever
being run. Do not try to run it.

`out` is deliberately identical in all three configs. `drizzle.config.ts` is the
one `generate` reads; the `-dev` / `-prod` configs add credentials and nothing
else. Two output folders would be two divergent histories describing one schema.

### Adding a Schema Change

1. Edit `src/db/schema.ts`
2. Adding a constraint over live data? First count violating rows with a
   read-only query (`bun -e` with `process.env.DATABASE_URL_DEV`; `.env`
   auto-loads in `packages/server`)
3. `bun run generate --name=<short_snake_name>` — writes the delta, applies
   nothing
4. **Read the generated SQL.** This is the review step the old `push` workflow
   never had. A rename drizzle could not infer arrives as DROP + ADD, which
   silently discards the column's data
5. `bun run migrate:dev`, then `bun run drift:dev` to confirm dev now matches
   `schema.ts` ("No changes detected")
6. Update Zod schemas in the relevant module if needed
7. Commit `src/db/schema.ts` **and** the new `drizzle/` folder together

Unlike `push`, a destructive delta needs no TTY: the decision is made at
generate time into a file a human reads, and `migrate` applies it
non-interactively. Agent shells can run the whole loop.

### Rules

- **Never edit an applied migration.** `migrate` decides what to skip by folder
  *name*, not by content hash (`getMigrationsToRun` in
  `drizzle-orm/migrator.utils.cjs`), so an edit is silently ignored on every
  database that already ran it. Fix forward with a new migration.
- **Never `push:prod`.** It applies changes outside the ledger, so history stops
  describing the database. It has been removed from `package.json`; `push:dev`
  survives for throwaway local prototyping only — anything you keep must go
  through `generate`.
- **Data migrations are hand-written.** No generator writes an `INSERT..SELECT`.
  Put the backfill in the generated `migration.sql` between the DDL halves, and
  split statements with `--> statement-breakpoint`.
- **No `BEGIN`/`COMMIT` in a migration file.** `migrate` wraps every pending
  migration and its ledger row in one transaction; a nested one breaks it. A
  failure rolls back the whole batch.
- `migrations:check` validates the folder for colliding migrations generated on
  parallel branches. Run it after a merge that brings in someone else's
  migration.

### Shipping a Schema Change to Prod

A column that exists in `schema.ts` but not in prod breaks **every** read that
selects it, not just the feature that added it: `findFirst` without a `columns:`
filter expands to `SELECT <table>.*` off the schema file, so one unapplied
column 500s the whole detail endpoint. Shipping code and applying migrations are
one deploy, not two.

1. `bun run drift:prod` — read-only. Prints how prod differs from `schema.ts`.
   Expect exactly the change your pending migrations describe; anything else is
   drift to deal with as its own change.
2. `bun run migrate:prod`. Applies every pending migration in order, in one
   transaction.
3. `bun run drift:prod` again — "No changes detected" is the confirmation.
4. `drift` does not diff CHECK constraints or partial indexes. Verify those
   directly via `pg_constraint` / `pg_indexes` — an empty plan is not proof they
   landed.

### Baselining a New Environment

`bun run baseline:<env>` records the first migration as applied without running
it, for a database that already has the schema. It refuses once that
environment's ledger holds any named migration, so it cannot be used to skip a
real change. A genuinely empty database needs `migrate:<env>` instead — which
will run the baseline snapshot as the real thing.
