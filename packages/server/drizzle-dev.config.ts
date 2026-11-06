import { defineConfig } from "drizzle-kit";

// Credentials only — see drizzle.config.ts for why `out` is shared.
export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL_DEV,
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  // The query-stats views turned on by hand for #181; not ours to drop.
  tablesFilter: ["!pg_stat_statements*"],
});
