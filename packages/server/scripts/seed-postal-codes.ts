// Loads the vendored kode pos reference data into postal_codes (ADR-0020).
//
//   bun run scripts/seed-postal-codes.ts dev
//   bun run scripts/seed-postal-codes.ts prod
//
// Deliberately not part of run-seed.ts: that one TRUNCATEs and regenerates fake
// data, and this is real reference data the picker needs in every environment.
// Idempotent — re-running only fills in codes that are missing, so it is safe
// after a refresh of the vendored file.
import { Pool } from "@neondatabase/serverless";
import rows from "../src/db/seed/postal-codes.json" with { type: "json" };

const BATCH = 500;

const env = process.argv[2]?.toUpperCase();
if (env !== "DEV" && env !== "PROD") {
  console.error("usage: bun run scripts/seed-postal-codes.ts <dev|prod>");
  process.exit(1);
}

const connectionString = process.env[`DATABASE_URL_${env}`];
if (!connectionString) {
  console.error(`DATABASE_URL_${env} is not set`);
  process.exit(1);
}

const pool = new Pool({ connectionString });
let inserted = 0;
try {
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    const values = batch
      .map((_, i) => {
        const p = i * 4;
        return `($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4})`;
      })
      .join(", ");
    const params = batch.flatMap((r) => [
      r.code,
      r.city,
      r.province,
      r.districts,
    ]);
    const result = await pool.query(
      `INSERT INTO postal_codes (code, city, province, districts)
       VALUES ${values}
       ON CONFLICT (code) DO NOTHING`,
      params
    );
    inserted += result.rowCount ?? 0;
  }
  const total = await pool.query("SELECT count(*)::int AS n FROM postal_codes");
  process.stdout.write(
    `${env}: inserted ${inserted} of ${rows.length}; postal_codes now holds ${total.rows[0].n}\n`
  );
} finally {
  await pool.end();
}
