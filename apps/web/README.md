# @fresclean/web

Admin web dashboard for Fresclean. React 19 + Vite + TypeScript.

- **Routing:** TanStack Router (file-based)
- **Data:** TanStack Query + typed RPC client from `@fresclean/api`
- **Forms:** react-hook-form + Zod (`zodResolver`)
- **State:** Zustand
- **UI:** shadcn (base-lyra), Base UI, Phosphor Icons, Tailwind CSS v4

## Commands

Run from this directory (or use the root `bun run dev` to start API + web together):

```sh
bun run dev               # Vite dev server at http://localhost:5173
bun run build             # TypeScript check + production build
bun run preview           # Preview the production build
bun run type-check        # Regenerate routes + TypeScript check
bun run generate-routes   # Regenerate TanStack Router route tree
```

The dev server expects the API running at port 8000 (`bun run dev` in `packages/server`).

## Notes

- Add shadcn components via `bunx shadcn@latest add <component>` into `src/components/ui/`.
- After renaming/creating a route file, run `bun run generate-routes` before type-checking.
- Conventions and structure: see [`AGENTS.md`](AGENTS.md).
