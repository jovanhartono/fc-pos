import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { relations } from "@/db/relations";

const isProduction = process.env.NODE_ENV === "production";
const databaseUrl = isProduction
  ? process.env.DATABASE_URL_PROD
  : process.env.DATABASE_URL_DEV;

if (!databaseUrl) {
  throw new Error(
    `Missing database connection string: ${
      isProduction ? "DATABASE_URL_PROD" : "DATABASE_URL_DEV"
    } is required`
  );
}

const sql = neon(databaseUrl);
export const db = drizzle({ client: sql, relations });
