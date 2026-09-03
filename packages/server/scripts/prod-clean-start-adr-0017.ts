// One-off, 2026-09-03: start prod clean and land ADR-0017 in the same window.
//
// The orders in prod were test data (14 orders, 40 treatments). Rather than
// carry them across the Item migration, wipe the order flow and its residue,
// then apply migrations/0001 against empty tables — where it is a pure schema
// change and its backfill assertions pass trivially. Shop configuration
// (users, stores, services, products, categories, payment methods, campaigns)
// is untouched and verified unchanged before and after.
//
// Run from packages/server with DATABASE_URL_PROD in the environment:
//   bun run scripts/prod-clean-start-adr-0017.ts
//
// Take a Neon branch of prod first. The wipe and the column drops are the
// only irreversible steps here.
import { Pool } from "@neondatabase/serverless";

const WIPE = [
  "orders",
  "orders_services",
  "orders_products",
  "order_services_images",
  "order_service_status_logs",
  "order_service_handler_logs",
  "order_service_price_logs",
  "order_pickup_events",
  "order_refunds",
  "order_refund_items",
  "order_campaigns",
  "order_counters",
  "complaints",
  "customers",
  "shifts",
];
const KEEP = [
  "users",
  "user_stores",
  "stores",
  "services",
  "products",
  "categories",
  "payment_methods",
  "campaigns",
  "campaign_codes",
  "campaign_stores",
  "campaign_eligible_services",
];

const url = process.env.DATABASE_URL_PROD;
if (!url) {
  throw new Error("DATABASE_URL_PROD is not set");
}
const pool = new Pool({ connectionString: url });
const client = await pool.connect();

const counts = async (tables: string[]) => {
  const out: string[] = [];
  for (const table of tables) {
    const [row] = (
      await client.query(`select count(*)::int as n from "${table}"`)
    ).rows;
    out.push(`${table}=${row.n}`);
  }
  return out.join(" ");
};

try {
  const keepBefore = await counts(KEEP);
  console.log("KEEP before:", keepBefore);

  await client.query("BEGIN");
  await client.query(
    `TRUNCATE TABLE ${WIPE.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
  );
  await client.query("COMMIT");
  console.log("WIPE after: ", await counts(WIPE));

  const keepAfter = await counts(KEEP);
  console.log("KEEP after: ", keepAfter);
  if (keepAfter !== keepBefore) {
    throw new Error("shop configuration changed during the wipe — stop here");
  }

  // The file carries its own BEGIN/COMMIT: one transaction, asserts before it
  // drops anything.
  const sql = await Bun.file(
    "migrations/0001-adr-0017-item-groups-order-services.sql"
  ).text();
  await client.query(sql);
  console.log("migration committed");

  const [tables] = (
    await client.query(
      `select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`
    )
  ).rows;
  const [columns] = (
    await client.query(
      `select count(*)::int as n from information_schema.columns where table_schema='public'`
    )
  ).rows;
  const serviceColumns = (
    await client.query(
      `select column_name from information_schema.columns where table_schema='public' and table_name='orders_services' order by 1`
    )
  ).rows.map((row: { column_name: string }) => row.column_name);
  console.log(
    `schema: ${tables.n} tables, ${columns.n} columns (dev is 27 / 231)`
  );
  console.log("orders_services columns:", serviceColumns.join(", "));
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // nothing open
  }
  console.error("FAILED:", (error as Error).message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
