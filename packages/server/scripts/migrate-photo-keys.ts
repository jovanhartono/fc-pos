/**
 * One-off: files existing order photos under the environment prefix their writer now uses.
 *
 * Photos uploaded before `STORAGE_ENV_PREFIX` existed sit at `orders/<id>/…` in a bucket both
 * environments share, which is the arrangement that let a sweep run against one database judge —
 * and delete — the other's dispute evidence. Moving them under `dev/` or `prod/` puts every key
 * inside the prefix its own sweep lists and no other.
 *
 * Driven from the database, not from a bucket listing: the rows are the photos an order still
 * points at, which are the ones that must not break. Anything in the bucket that no row names is
 * left where it is — it cannot be listed with the credentials this repo holds, and once the
 * sweep only looks under the new prefix, nothing will collect it.
 *
 * Reports what it would do and writes nothing unless passed --apply. Safe to re-run: a row whose
 * object is already at the new key is skipped, and each row's old object is deleted only once its
 * copy is verified and the row points at it.
 *
 *   cd packages/server
 *   bun run scripts/migrate-photo-keys.ts --env dev
 *   bun run scripts/migrate-photo-keys.ts --env dev --apply
 */

import { neon } from "@neondatabase/serverless";
import { s3 } from "bun";

// Every column that holds a photo key: against a service line, as the drop-off shot, and as proof
// of pickup. Miss one and its photos are left outside the prefix the sweep will be reading.
const PHOTO_COLUMNS = [
  { column: "dropoff_photo_path", table: "orders" },
  { column: "image_path", table: "order_services_images" },
  { column: "image_path", table: "order_pickup_events" },
] as const;

const OLD_PREFIX = "orders/";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const env = args[args.indexOf("--env") + 1];

if (env !== "dev" && env !== "prod") {
  throw new Error("Pass --env dev or --env prod");
}

// Spelled out rather than read from NODE_ENV: this script moves production photos when told to,
// so which environment it is working on is the one thing it must not infer.
const databaseUrl =
  env === "prod" ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL_DEV;

if (!databaseUrl) {
  throw new Error(`Missing DATABASE_URL_${env.toUpperCase()}`);
}

const sql = neon(databaseUrl);
const newPrefix = `${env}/`;

const tally = { copied: 0, failed: 0, skipped: 0 };

for (const { table, column } of PHOTO_COLUMNS) {
  const rows = (await sql.query(
    `select distinct ${column} as key from ${table} where ${column} like $1`,
    [`${OLD_PREFIX}%`]
  )) as { key: string }[];

  console.info(`\n${table}.${column}: ${rows.length} to move`);

  for (const { key } of rows) {
    const newKey = `${newPrefix}${key}`;

    if (!apply) {
      console.info(`  would move ${key} -> ${newKey}`);
      tally.skipped += 1;
      continue;
    }

    try {
      const source = s3.file(key);
      const stats = await source.stat();

      // Written every time rather than only when missing: without s3:ListBucket these credentials
      // get 403 for a key that is not there, so "already copied" and "not allowed to look" are
      // the same answer. Re-writing the same bytes over themselves is the cheaper certainty.
      const destination = s3.file(newKey);
      await destination.write(await source.arrayBuffer(), { type: stats.type });

      // The row is only repointed once the photo is provably readable at the new key. A row
      // pointing at bytes that are not there is a photo the shop has lost.
      const copied = await destination.stat();
      if (copied.size !== stats.size) {
        throw new Error(
          `size mismatch: ${stats.size} at old key, ${copied.size} at new`
        );
      }

      await sql.query(
        `update ${table} set ${column} = $1 where ${column} = $2`,
        [newKey, key]
      );
      await s3.delete(key);

      console.info(`  moved ${key} -> ${newKey}`);
      tally.copied += 1;
    } catch (error) {
      // Named as well as described: S3 reports most of its refusals as "an unexpected error has
      // occurred", and which step refused is the whole diagnosis.
      const failure = error as { code?: string; message: string; name: string };
      console.error(
        `  FAILED ${key}: ${failure.name}/${failure.code ?? "?"} ${failure.message}`
      );
      tally.failed += 1;
    }
  }
}

console.info(
  `\n${env}: ${tally.copied} moved, ${tally.skipped} pending (dry run), ${tally.failed} failed`
);

if (tally.failed > 0) {
  process.exitCode = 1;
}
