import { defineConfig } from "drizzle-kit";

// Credentials only — see drizzle.config.ts for why `out` is shared.
export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL_PROD,
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
});
