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

// The pool, or an open transaction, so a checkout's read sees its own writes
// and does not hold a second connection.
export type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];
