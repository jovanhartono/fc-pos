import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
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

// Bun ships global WebSocket — no neonConfig.webSocketConstructor needed.
const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client: pool, relations });

// Anything a query can run on: the pool, or an open transaction handed down so
// a read sees the writes the same checkout has already made and does not take a
// second connection out of the pool while the first one is still held.
export type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];
