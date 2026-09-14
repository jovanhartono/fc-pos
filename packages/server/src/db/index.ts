import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { relations } from "@/db/relations";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
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
