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
