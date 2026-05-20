# Server / API Standards

`@fresclean/api` — Hono + Drizzle + Zod on Bun. Repo-wide rules: `../../AGENTS.md`

## Commands

```bash
bun run dev          # API (port 8000) + tsdown --watch
bun run push:dev     # Push schema directly to dev DB
bun run seed:dev     # Seed dev DB
bunx tsdown          # One-off type export build
```

## Conventions

- New admin endpoints: `src/routes/admin/` → mount in `src/routes/admin/index.ts`. `adminMiddleware` covers `/admin/*`.
- Domain logic in **modules** (`src/modules/<domain>/`): `*.schema.ts` → `*.repository.ts` → `*.service.ts`. Routes call services directly — no controller layer.
- **Naming**: Repository functions use DB verbs (`insertX`, `findX`, `updateXById`, `listX`, `deleteXById`). Service functions use domain verbs (`createX`, `getX`, `updateX`, `deleteX`).
- **Prepared statements**: Use Drizzle's `.prepare()` for hot-path queries (findById, auth lookups). See existing patterns in repositories and `utils/authorization.ts`.
- **Relational query `where`**: For `db.query.*.findMany()` / `findFirst()`, use Drizzle v2 object-based `where` syntax inline — `{ is_active: true }`, `{ stores: { store_id: 1 } }`, `OR`/`AND`/`NOT` keys, `undefined` to omit optional filters. Do **not** build a separate function that returns raw SQL via `{ RAW: () => ... }` — it produces "invalid reference to FROM-clause entry" errors because raw SQL references the original table, not the alias Drizzle uses internally. Reserve raw `eq`/`and`/`sql` for `db.select()`, `db.$count()`, `db.update()`, `db.delete()` which don't alias.
- Use `src/utils/http.ts` helpers (`success()`, `failure()`) for responses.
- Export types/schemas for web via package exports (`schema`, `rpc`, `types`) — no deep internal imports from `@fresclean/web`.
- Migrations: `drizzle-*` scripts in `package.json` with matching config per environment.
- **Date query params**: `dateStringSchema()` requires `YYYY-MM-DD` — never send `.toISOString()`. Used on shifts, reports, daily-report endpoints.
- **Timezone**: all `dayjs()` calls that compute day/week/month boundaries or format date strings must use `.tz("Asia/Jakarta")`. Bootstrap `utc` + `timezone` plugins at server entry. Use `src/utils/date.ts` helpers (`jakartaNow`, `jakartaDayStart`, `jakartaDayEnd`) — do NOT inline `dayjs().startOf("day")`. Reports module uses `AT TIME ZONE 'Asia/Jakarta'` in SQL; orders/repositories must match via dayjs TZ.
