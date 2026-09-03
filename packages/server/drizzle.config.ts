import { defineConfig } from "drizzle-kit";

// Shared by every environment. `generate` reads this one — the migration
// sequence in ./drizzle is committed and applied to dev and prod in the same
// order, so there is deliberately no per-environment `out`: two output folders
// would be two divergent histories claiming to describe one schema.
//
// The env configs (drizzle-dev.config.ts / drizzle-prod.config.ts) exist only
// to point `migrate` at a database. They must never change `out` or `schema`.
export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
});
