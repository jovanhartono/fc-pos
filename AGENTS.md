# Fresclean Codex Guide

This file provides Codex-facing guidance for working in this repository.

## Overview

**Fresclean** is a Bun monorepo for a laundry and cleaning service business. It consists of an API server and an admin web dashboard.

| Package | Name | Path | Role |
| --- | --- | --- | --- |
| Server | `@fresclean/api` | `packages/server` | Hono REST API with Drizzle, Zod schemas, and RPC types |
| Web | `@fresclean/web` | `apps/web` | React 19 + Vite admin app |

The web package consumes the server package as a workspace dependency for shared types, Zod schemas, and the typed Hono RPC client.

## Quick Start

Run from the repo root unless a command says otherwise.

```bash
bun install
bun run dev
bun run build
bun run lint
bun run type-check
```

Server only:

```bash
cd packages/server
bun run dev
```

Web only:

```bash
cd apps/web
bun run dev
bun run build
bun run type-check
bun run generate-routes
```

## Workspace Rules

- Uses **Ultracite** (Biome). Run `bun x ultracite fix` before committing.
- Run Ultracite from the repo root. Running it from `apps/web` or `packages/server` mangles paths.
- Package-specific rules live in `apps/web/AGENTS.md` and `packages/server/AGENTS.md`.

## TypeScript Rules

- Explicit types when they enhance clarity; `unknown` over `any`.
- `const` default, `let` when needed, never `var`.
- Arrow functions for callbacks; `for...of` over `.forEach()`.
- Optional chaining (`?.`), nullish coalescing (`??`), template literals, and destructuring.
- `async/await` over promise chains; always `await` promises.
- Early returns over nested conditionals.
- No `console.log`, `debugger`, or `alert` in production code.
- Throw `Error` objects, not strings.
- No spread in loop accumulators; use top-level regex literals.
- Specific imports over namespace imports; no re-export barrel files.

## Server Architecture

Domain logic follows a route to service to repository pattern:

```text
packages/server/src/modules/<domain>/
  *.schema.ts
  *.repository.ts
  *.service.ts
```

Routes in `packages/server/src/routes/` are thin HTTP handlers that call services directly. Admin routes are mounted under `packages/server/src/routes/admin/` and are protected by `adminMiddleware` on `/admin/*`.

Use response helpers from `packages/server/src/utils/http.ts`:

```ts
success(data, message?, meta?)
failure(message, errors?)
```

## Web Architecture

```text
apps/web/src/
  components/ui/
  components/form/
  features/<domain>/
  hooks/
  lib/
  routes/
  shared/
  stores/
```

UI gotchas:

- Base UI `PopoverTrigger render={<div/>}` requires `nativeButton={false}`.
- Biome a11y disallows `role="button"` on `span` or `div`; use a real `<button>`.
- `role="combobox"` requires `aria-expanded`.
- Base UI `Select` inside a `Popover` can show the raw value before items register. Use a function-child mapper in `SelectValue` or use `Combobox` when labels must be stable.

## Database

Run Drizzle commands from `packages/server`:

```bash
bun run generate:dev
bun run migrate:dev
bun run push:dev
bun run pull:dev
bun run seed:dev
```

Replace `:dev` with `:prod` for production. Schema is in `packages/server/src/db/schema.ts`; database connection code is in `packages/server/src/db/index.ts`.

## Common Tasks

Adding a new admin endpoint:

1. Create module files in `packages/server/src/modules/<domain>/`.
2. Create the route file in `packages/server/src/routes/admin/<domain>.ts`.
3. Mount the route in `packages/server/src/routes/admin/index.ts`.
4. Keep admin middleware centralized; it is already applied to `/admin/*`.

Adding a schema change:

1. Edit `packages/server/src/db/schema.ts`.
2. Run `bun run generate:dev`.
3. Run `bun run migrate:dev`.
4. Update the relevant Zod schemas.

Building server types for web:

```bash
cd packages/server && bunx tsdown
```

## Scope References

- `docs/deferred-actions.md` lists explicitly deferred work; do not re-propose unless a trigger is hit.
- `docs/production-readiness-audit.md` contains original findings and rationale.
- `docs/overcomplexity-audit.md` contains simplification targets and complexity notes.
- `TODO.md` is the current lightweight task list when present.

@packages/server/AGENTS.md
@apps/web/AGENTS.md
