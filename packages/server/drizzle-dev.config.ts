import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL_DEV,
  },
  dialect: "postgresql",
  out: "./drizzle/dev",
  schema: "./src/db/schema.ts",
});
