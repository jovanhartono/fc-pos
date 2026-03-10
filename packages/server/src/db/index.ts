import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
// biome-ignore lint/performance/noNamespaceImport: for drizzle only
import * as schema from "@/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_DEV });
export const db = drizzle({ client: pool, schema });
