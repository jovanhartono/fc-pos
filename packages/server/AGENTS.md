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
- Use `src/utils/http.ts` helpers (`success()`, `failure()`) for responses.
- Export types/schemas for web via package exports (`schema`, `rpc`, `types`) — no deep internal imports from `@fresclean/web`.
- Migrations: `drizzle-*` scripts in `package.json` with matching config per environment.
- **Date query params**: `dateStringSchema()` requires `YYYY-MM-DD` — never send `.toISOString()`. Used on shifts, reports, daily-report endpoints.
- **Timezone**: all `dayjs()` calls that compute day/week/month boundaries or format date strings must use `.tz("Asia/Jakarta")`. Bootstrap `utc` + `timezone` plugins at server entry. Use `src/utils/date.ts` helpers (`jakartaNow`, `jakartaDayStart`, `jakartaDayEnd`) — do NOT inline `dayjs().startOf("day")`. Reports module uses `AT TIME ZONE 'Asia/Jakarta'` in SQL; orders/repositories must match via dayjs TZ.
