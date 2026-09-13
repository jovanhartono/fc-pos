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
