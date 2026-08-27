# Dead — output of an old `drizzle-kit pull`, August 2025

Not imported by anything, and a year behind `src/db/schema.ts`. It sits under
`drizzle/` because `tsconfig.json` excludes that path — the only reason these
files have never failed a type-check. Moving them under `src/` breaks the build.

`drizzle-kit` ignores this folder: it reads `drizzle/*.sql` and `drizzle/meta/`.

Safe to delete.
