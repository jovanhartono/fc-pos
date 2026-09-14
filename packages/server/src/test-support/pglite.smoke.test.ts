import "@/test-support/pglite";
import { beforeEach, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

beforeEach(async () => {
  await resetDb();
});

it("migrates and seeds a shop", async () => {
  const shop = await seedShop();

  const store = await testDb.query.storesTable.findFirst({
    where: { id: shop.store.id },
  });

  expect(store?.code).toBe("KMG");
  expect(shop.admin.role).toBe("admin");
});

// Reports bucket by Jakarta time in SQL, so the harness is only usable for them
// if this build of Postgres carries the zone at all.
it("knows the Jakarta timezone", async () => {
  const result = await testDb.execute<{ offset: string }>(
    sql`SELECT (now() AT TIME ZONE 'Asia/Jakarta') - (now() AT TIME ZONE 'UTC') AS offset`
  );

  expect(String(result.rows[0].offset)).toContain("07:00");
});
