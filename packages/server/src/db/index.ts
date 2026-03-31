import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { relations } from "@/db/relations";

const sql = neon(process.env.DATABASE_URL_DEV);
export const db = drizzle({ client: sql, relations });
