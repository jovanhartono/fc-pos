# Ultracite Code Standards

Uses **Ultracite** (Biome). Run `bun x ultracite fix` before committing.

## Workspace

| Package | Path | Role |
| --- | --- | --- |
| `@fresclean/web` | `packages/web` | Vite + React admin app |
| `@fresclean/api` | `packages/server` | Hono API, Drizzle, Zod schemas, RPC types |

Package-specific rules: `packages/web/AGENTS.md` · `packages/server/AGENTS.md`

## TypeScript Rules

- Explicit types when they enhance clarity; `unknown` over `any`
- `const` default, `let` when needed, never `var`
- Arrow functions for callbacks; `for...of` over `.forEach()`
- Optional chaining (`?.`), nullish coalescing (`??`), template literals, destructuring
- `async/await` over promise chains; always `await` promises
- Early returns over nested conditionals
- No `console.log`, `debugger`, `alert` in production
- Throw `Error` objects, not strings
- No spread in loop accumulators; top-level regex literals
- Specific imports over namespace imports; no barrel files

## Testing

- Assertions inside `it()`/`test()` blocks; async/await, no done callbacks
- No `.only` or `.skip` in committed code
