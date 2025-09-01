import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
// biome-ignore lint/performance/noNamespaceImport: for drizzle only
import * as schema from "@/db/schema";

const sql = neon(process.env.DATABASE_URL_DEV);
export const db = drizzle({ client: sql, schema });
