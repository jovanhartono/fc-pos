import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL_PROD,
  },
  dialect: "postgresql",
  out: "./drizzle/prod",
  schema: "./src/db/schema.ts",
});
