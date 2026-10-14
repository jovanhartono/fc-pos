import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { customersTable, ordersTable } from "@/db/schema";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

const { jakartaBucketExpr } = await import(
  "@/modules/reports/report-range.util"
);
const { ordersInTrendSeries } = await import(
  "@/modules/reports/report.repository"
);

// Neon runs its sessions in GMT, and the timestamp columns hold UTC wall time.
const setSessionZone = (zone: string) =>
  testDb.execute(sql`SELECT set_config('TimeZone', ${zone}, false)`);

// The Jakarta week of 5 to 7 October 2026.
const RANGE = {
  end: new Date("2026-10-07T17:00:00.000Z"),
  start: new Date("2026-10-04T17:00:00.000Z"),
};

let shop: Shop;

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
  const [customer] = await testDb
    .insert(customersTable)
    .values({
      created_by: shop.admin.id,
      name: "Budi Santoso",
      origin_store_id: shop.store.id,
      phone_number: "+628111222333",
      updated_by: shop.admin.id,
    })
    .returning();

  // 13:16 Jakarta on 6 October is 06:16 UTC; 03:00 Jakarta on 6 October is
  // 20:00 UTC the evening before.
  await testDb.insert(ordersTable).values(
    [
      { code: "A", created_at: new Date("2026-10-06T06:16:00.000Z") },
      { code: "B", created_at: new Date("2026-10-05T20:00:00.000Z") },
    ].map((order) => ({
      ...order,
      created_by: shop.admin.id,
      customer_id: customer.id,
      store_id: shop.store.id,
      updated_by: shop.admin.id,
    }))
  );
});

describe("which Jakarta day an order lands on", () => {
  it.each(["UTC", "Asia/Jakarta"])(
    "buckets a 13:16 Jakarta order on its own day in a %s session",
    async (zone) => {
      await setSessionZone(zone);
      const result = await testDb.execute<{ day: string }>(
        sql`SELECT ${jakartaBucketExpr(ordersTable.created_at, "day")} AS day FROM orders ORDER BY orders.code`
      );

      expect(result.rows.map((row) => row.day)).toEqual([
        "2026-10-06",
        "2026-10-06",
      ]);
    }
  );

  it("counts both orders on 6 October in the Overview's daily series", async () => {
    await setSessionZone("UTC");
    const series = await ordersInTrendSeries({ range: RANGE });

    expect(series).toEqual([{ day: "2026-10-06", orders_in: 2 }]);
  });
});
