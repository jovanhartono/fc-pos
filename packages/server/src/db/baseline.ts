// One-time: adopt drizzle migrations on a database whose schema was built by
// `push` and therefore has no migration history.
//
// The baseline migration is a full CREATE TABLE snapshot of a schema that
// already exists, so it must be RECORDED WITHOUT BEING RUN. This marks it
// applied; every migration after it runs normally via `migrate:<env>`.
//
//   bun run src/db/baseline.ts dev
//   bun run src/db/baseline.ts prod
//
// Safe to re-run: it refuses once the ledger holds a named migration, so it can
// only ever be used for the baseline and never to skip a real change.

import { Pool } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";

const MIGRATIONS_FOLDER = "./drizzle";
const LEDGER = 'drizzle."__drizzle_migrations"';

const env = process.argv[2]?.toUpperCase();
if (env !== "DEV" && env !== "PROD") {
  console.error("usage: bun run src/db/baseline.ts <dev|prod>");
  process.exit(1);
}

const connectionString = process.env[`DATABASE_URL_${env}`];
if (!connectionString) {
  console.error(`DATABASE_URL_${env} is not set`);
  process.exit(1);
}

// Drizzle's own reader, deliberately — it derives the name, the sha256 and the
// folder timestamp exactly the way `migrate` will when it decides what to skip.
// Recomputing any of that here is how a baseline ends up not matching.
const local = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
if (local.length === 0) {
  console.error(`no migrations found in ${MIGRATIONS_FOLDER}`);
  process.exit(1);
}

const [baseline] = local;

const pool = new Pool({ connectionString });

try {
  await pool.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  // Matches the shape drizzle-orm beta expects. `name` is the column that
  // decides what has run; the older push-era ledger predates it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${LEDGER} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint,
      name text,
      applied_at timestamp with time zone DEFAULT now()
    )`);
  await pool.query(`ALTER TABLE ${LEDGER} ADD COLUMN IF NOT EXISTS name text`);
  await pool.query(
    `ALTER TABLE ${LEDGER} ADD COLUMN IF NOT EXISTS applied_at timestamp with time zone DEFAULT now()`
  );

  const named = await pool.query(
    `SELECT name FROM ${LEDGER} WHERE name IS NOT NULL ORDER BY id`
  );
  if (named.rows.length > 0) {
    console.error(
      `${env} already has migration history — refusing to baseline.\n` +
        `  recorded: ${named.rows.map((r) => r.name).join(", ")}\n` +
        "  Use migrate:<env> to apply pending migrations."
    );
    process.exit(1);
  }

  // Rows written before the `name` column existed. `migrate` ignores them
  // (it filters name IS NULL), but they describe a history that was abandoned
  // for `push` years ago, and leaving them in the ledger we now trust invites
  // someone to read them as real.
  const orphaned = await pool.query(
    `DELETE FROM ${LEDGER} WHERE name IS NULL RETURNING id`
  );

  await pool.query(
    `INSERT INTO ${LEDGER} ("hash", "created_at", "name") VALUES ($1, $2, $3)`,
    [baseline.hash, baseline.folderMillis, baseline.name]
  );

  console.log(`${env}: baselined at ${baseline.name}`);
  console.log(`  cleared ${orphaned.rows.length} pre-baseline row(s)`);
  console.log(`  ${local.length - 1} migration(s) left pending`);
} finally {
  await pool.end();
}
