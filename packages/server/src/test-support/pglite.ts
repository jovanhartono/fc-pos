import { afterAll, mock } from "bun:test";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { relations } from "@/db/relations";

// A throwaway Postgres built from the real `./drizzle/` ledger, so a suite runs
// the shop's real schema and SQL, such as the rollup behind an Order's status.
// Import it FIRST in an integration suite, so nothing under test reaches the real `@/db`.
const client = new PGlite();

export const testDb = drizzle({ client, relations });

mock.module("@/db", () => ({ db: testDb }));

await migrate(testDb, {
  migrationsFolder: join(import.meta.dir, "../../drizzle"),
});

// Left open, this database keeps the process alive and Bun exits 99 with every
// test still green — which reads to CI as a failed run.
afterAll(() => client.close());

let truncateEveryTable: string | undefined;

// Between cases, never inside one: the services open their own transactions,
// so wrapping a case in a rollback would undo nothing they did.
export async function resetDb() {
  if (!truncateEveryTable) {
    const tables = await testDb.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    truncateEveryTable = `TRUNCATE TABLE ${tables.rows
      .map((row) => `public."${row.table_name}"`)
      .join(", ")} RESTART IDENTITY CASCADE`;
  }

  await testDb.execute(sql.raw(truncateEveryTable));
}
