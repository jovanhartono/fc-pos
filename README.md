# Fresclean

![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)
![React](https://img.shields.io/badge/React_19-087EA4?logo=react&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle-C5F74F?logo=drizzle&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Turborepo](https://img.shields.io/badge/Turborepo-EF4444?logo=turborepo&logoColor=white)

Bun monorepo for a laundry/cleaning service business: a REST API and an admin web dashboard.

| Package | Name | Path | Description |
| --- | --- | --- | --- |
| Server | `@fresclean/api` | [`packages/server`](packages/server) | Hono REST API with Drizzle ORM (PostgreSQL via Neon) |
| Web | `@fresclean/web` | [`apps/web`](apps/web) | React 19 + Vite admin dashboard |

The web app consumes the server package as a workspace dependency for shared types, Zod schemas, and a typed RPC client (Hono `hc<AppType>()`).

## Architecture

```mermaid
flowchart LR
    subgraph web["apps/web · @fresclean/web"]
        UI["React 19<br/>TanStack Router / Query"]
        RPC["Typed RPC client<br/>hc&lt;AppType&gt;()"]
        UI --> RPC
    end

    subgraph server["packages/server · @fresclean/api"]
        Routes["Hono routes /api<br/>JWT middleware on /admin/*"]
        Services["Services<br/>(business logic)"]
        Repos["Repositories<br/>(Drizzle queries)"]
        Routes --> Services --> Repos
    end

    RPC -- "HTTP /api" --> Routes
    Repos --> DB[("Neon<br/>PostgreSQL")]
    Services --> S3["AWS S3<br/>(presigned photo uploads)"]
    server -. "tsdown build<br/>AppType · schemas · types" .-> web
```

End-to-end type safety with no codegen: the server exports its Hono `AppType` and Zod schemas, `tsdown` bundles them into the workspace package, and the web app gets fully typed API calls, request validation, and form schemas from a single source of truth.

Domain logic on the server follows a 3-layer module pattern — thin HTTP routes call **services** (domain verbs: `createOrder`, `getShift`), which orchestrate **repositories** (DB verbs: `insertOrder`, `findShiftById`).

## Quick Start

```sh
bun install        # Install all workspace dependencies
bun run dev        # Build API types, then start server (:8000) + web (:5173)
```

## Scripts

Tasks are orchestrated by Turborepo and run across all packages:

```sh
bun run build         # Build all packages (cached)
bun run lint          # Lint all packages (cached)
bun run type-check    # Type-check all packages (cached)
```

Linting/formatting uses [Ultracite](https://ultracite.ai) (Biome preset) — run `bun x ultracite fix` from the repo root. Husky runs Biome on staged files before every commit.

## Environment Variables

The server reads from `process.env` (`.env` in `packages/server`):

- `DATABASE_URL_DEV` / `DATABASE_URL_PROD` — Neon PostgreSQL connection strings
- `JWT_SECRET` — secret key for JWT authentication

## Docs

- [`CLAUDE.md`](CLAUDE.md) / `AGENTS.md` — architecture, conventions, common tasks
- [`CONTEXT.md`](CONTEXT.md) — domain glossary and relationships
- [`docs/adr/`](docs/adr) — architecture decision records
