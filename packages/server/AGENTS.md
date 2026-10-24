# Server / API Standards

`@fresclean/api` — Hono + Drizzle + Zod on Bun. Repo-wide rules: `../../AGENTS.md`

## Conventions

- New admin endpoints: `src/routes/admin/` → mount in `src/routes/admin/index.ts`. `adminMiddleware` covers `/admin/*`.
- Domain logic in **modules** (`src/modules/<domain>/`): `*.schema.ts` → `*.repository.ts` → `*.service.ts`. Routes call services directly — no controller layer.
- **Naming**: Repository functions use DB verbs (`insertX`, `findX`, `updateXById`, `listX`, `deleteXById`). Service functions use domain verbs (`createX`, `getX`, `updateX`, `deleteX`).
- **Prepared statements**: Use Drizzle's `.prepare()` for hot-path queries (findById, auth lookups). See existing patterns in repositories and `utils/authorization.ts`.
- **Relational query `where`**: For `db.query.*.findMany()` / `findFirst()`, use Drizzle v2 object-based `where` syntax inline — `{ is_active: true }`, `{ stores: { store_id: 1 } }`, `OR`/`AND`/`NOT` keys, `EmptyFilter` (from `drizzle-orm`) to omit optional filters — an `undefined` anywhere in a relational `where` throws at runtime and the types don't catch it. No `{ RAW: () => ... }` helpers: raw SQL names the base table, not Drizzle's alias, and fails with "invalid reference to FROM-clause entry". Raw `eq`/`and`/`sql` belong to `db.select()`, `db.$count()`, `db.update()`, `db.delete()`, which don't alias.
- **Only the Order Status Machine writes status** (`modules/orders/order-status-machine.ts`): `orders.status` and `orders_services.status`, with the status-log row and the Order rollup. `picked_up` and `refunded` come only from `completePickup` and `applyRefundTransition`. A handler writing a status column itself skips the photo gate and the audit log.
- **Refuse inactive rows on the server**, not only by hiding them in the POS.
- Use `src/utils/http.ts` helpers (`success()`, `failure()`) for responses.
- **Tests**: run them through `bun run test`, which passes `--isolate`. `*.integration.test.ts` files swap `@/db` (and sometimes `@/utils/s3`) for the whole module registry, so a bare `bun test <file>` drops the isolation and lets those mocks leak into every other file in the run.
- Export types/schemas for web via package exports (`schema`, `rpc`, `types`) — no deep internal imports from `@fresclean/web`.
- **Date query params**: `dateStringSchema()` requires `YYYY-MM-DD` — never send `.toISOString()`.
- **Timezone** (ADR-0002): day/week/month boundaries and date strings use the `src/utils/date.ts` helpers (`jakartaNow`, `jakartaDayStart`, `jakartaDayEnd`), never a bare `dayjs().startOf("day")`. SQL buckets days through `jakartaBucketExpr`: columns hold UTC wall time, so a single `AT TIME ZONE 'Asia/Jakarta'` lands 14h off. `modules/reports/report-range.util.ts` uses fixed UTC+7 arithmetic on purpose so its labels match Postgres' buckets exactly.

## Database

Schema lives in `src/db/schema.ts`; the connection in `src/db/index.ts`.

**Migrations are the workflow.** `./drizzle/` holds an ordered, committed
sequence of `<timestamp>_<name>/migration.sql`, applied to every environment in
the same order. `drizzle/20260827073115_baseline` is a full snapshot of the
schema as it stood when the ledger began, recorded as applied without ever
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
4. **Read the generated SQL.** A rename drizzle could not infer arrives as
   DROP + ADD, which silently discards the column's data
5. `bun run migrate:dev`, then `bun run drift:dev` to confirm dev now matches
   `schema.ts` ("No changes detected"). Any difference makes drift exit 2 with
   data-loss hints instead. Never pass them: dev is shared, so a table or
   column your change doesn't touch is another branch's `push:dev` work
6. Update Zod schemas in the relevant module if needed
7. Commit `src/db/schema.ts` **and** the new `drizzle/` folder together

A destructive delta needs no TTY: the decision is made at generate time into a
file a human reads, and `migrate` applies it non-interactively. Agent shells
can run the whole loop.

A rename is the one case `generate` cannot decide alone. Without a TTY it exits
with code 2 and prints the hint objects it needs; re-run with them:

```bash
bun drizzle-kit generate --config=drizzle.config.ts --name=<name> \
  --hints '[{"type":"rename","kind":"table","from":["public","old"],"to":["public","new"]}]'
```

One entry per unresolved table, column, index, or FK decision (`rename` or
`create`); later decisions may only appear once earlier ones resolve, so a second
round is normal. Still read the SQL: a new NOT NULL column on a populated table
arrives without a backfill and has to be split into ADD → UPDATE → SET NOT NULL
by hand.

### Rules

- **Never edit an applied migration.** `migrate` decides what to skip by folder
  *name*, not by content hash (`getMigrationsToRun` in
  `drizzle-orm/migrator.utils.cjs`), so an edit is silently ignored on every
  database that already ran it. Fix forward with a new migration.
- **`push:dev` is for throwaway local prototyping only.** It applies changes
  outside the ledger, so history stops describing the database; anything you
  keep goes through `generate`. There is no `push:prod`.
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

`migrate:prod` writes to production: an agent asks Jovan before running it, or hands it over as a `! bun run migrate:prod` line.

1. `bun run drift:prod` — read-only. Prints how prod differs from `schema.ts`.
   Expect exactly the change your pending migrations describe; anything else is
   drift to deal with as its own change.
2. `bun run migrate:prod`, before the PR merges. Applies every pending
   migration in order, in one transaction. Safe because prod still runs the
   old code, so only additive changes go out this way: a rename or drop breaks
   it until the merge deploys. Split those: add + backfill, ship, drop later.
3. `bun run drift:prod` again — "No changes detected" is the confirmation.
4. `drift` does not diff CHECK constraints or partial indexes. Verify those
   directly via `pg_constraint` / `pg_indexes` — an empty plan is not proof they
   landed.

### Baselining a New Environment

`bun run baseline:<env>` marks the baseline applied on a database that already
has the schema; it refuses once any named migration is recorded. An empty
database takes `migrate:<env>`, which runs the baseline for real.
