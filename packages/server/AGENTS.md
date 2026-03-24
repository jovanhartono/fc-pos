# Server / API Package Standards

Applies to **`packages/server`** (`@fresclean/api`) only. Repo-wide TypeScript and Ultracite rules: **`../../AGENTS.md`**.

## Stack

- **Runtime:** Bun
- **HTTP:** Hono (`src/app.ts` mounts under `/api`, CORS for local Vite origins)
- **Database:** Drizzle ORM + Neon (`src/db/`)
- **Validation / types:** Zod, `@hono/zod-validator`, `drizzle-zod`; shared schemas exported as `@fresclean/api/schema`
- **Client contract:** `AppType` from `src/index.ts` drives typed `hono/client` RPC in the web app (`@fresclean/api/rpc`)

## Layout

```
src/
├── app.ts              # Base Hono app + global middleware
├── index.ts            # Route mounting, onError, default export (fetch + port)
├── rpc.ts              # hc<> helper for typed client
├── routes/
│   ├── admin/          # Admin API (JWT via admin middleware)
│   ├── public/
│   └── auth.ts
├── middlewares/
├── modules/<domain>/    # Per-domain *.schema.ts, *.repository.ts, *.service.ts, *.controller.ts
├── schema/             # Cross-cutting Zod types for RPC
├── utils/
└── db/
```

## Conventions

- Register new admin endpoints under `src/routes/admin/` and mount them in `src/routes/admin/index.ts`. Use `adminMiddleware` on `/admin/*` from `src/index.ts`.
- Keep domain logic in **modules** (repository → service → controller); route files should stay thin.
- Prefer existing helpers (`src/utils/http.ts` for JSON shapes, `src/utils/zod-validator-wrapper.ts` where used) over ad hoc handlers.
- Export types and schemas the web app needs via package `exports` (`schema`, `rpc`, `types`) — avoid reaching into deep internal paths from `@fresclean/web`.

## Migrations and DB CLI

Use the `drizzle-*` scripts in `package.json` (`generate:dev`, `migrate:dev`, `push:dev`, etc.) with the matching `drizzle-*.config.ts` for the target environment.
