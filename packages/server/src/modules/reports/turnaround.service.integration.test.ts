import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import {
  categoriesTable,
  complaintsTable,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
} from "@/db/schema";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// August at the Kemang shop. Every Order is dropped off 1 August 09:00 and the
// workshop picks each Item up two hours later, so what varies is when each
// Item became ready.

// Loaded after the swap above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the shop's real database.
const { createOrder } = await import("@/modules/orders/order.service");
const { getTurnaroundReport, TURNAROUND_MIN_ITEMS } = await import(
  "@/modules/reports/turnaround.service"
);

const AUGUST = { from: "2026-08-01", to: "2026-08-05" };
const HOUR_MS = 3_600_000;
const jkt = (local: string) => new Date(`${local}:00+07:00`);
const DROP_OFF = jkt("2026-08-01T09:00");
const afterDropOff = (hours: number) =>
  new Date(DROP_OFF.getTime() + hours * HOUR_MS);

let shop: Shop;
let bintaro: typeof storesTable.$inferSelect;
let cleanId: number;
let repairId: number;
let bagCleanId: number;

interface Placed {
  itemId: number;
  lines: Map<number | null, number>;
  orderId: number;
}

const placeOrder = async (
  store: Shop["store"],
  items: { brand: string; serviceIds: number[] }[]
) => {
  const order = await createOrder(shop.admin.id, store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    items: items.map(({ brand, serviceIds }) => ({
      brand,
      services: serviceIds.map((id) => ({ id })),
    })),
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid",
    store_id: store.id,
    voucher_codes: [],
  });
  await testDb
    .update(ordersTable)
    .set({ created_at: DROP_OFF })
    .where(eq(ordersTable.id, order.id));
  const placed = await testDb.query.itemsTable.findMany({
    where: { order_id: order.id },
    with: { services: true },
  });
  return Object.fromEntries(
    placed.map((item) => [
      item.brand ?? "",
      {
        itemId: item.id,
        lines: new Map(item.services.map((line) => [line.service_id, line.id])),
        orderId: order.id,
      } satisfies Placed,
    ])
  );
};

// Picked up two hours after drop-off, ready `readyAt`.
const readyAt = (lineId: number, at: Date) =>
  testDb.insert(orderServiceStatusLogsTable).values([
    {
      changed_by: shop.admin.id,
      created_at: afterDropOff(2),
      from_status: "queued",
      order_service_id: lineId,
      to_status: "processing",
    },
    {
      changed_by: shop.admin.id,
      created_at: at,
      from_status: "quality_check",
      order_service_id: lineId,
      to_status: "ready_for_pickup",
    },
  ]);

const setStatus = (
  lineId: number,
  status: (typeof ordersServicesTable.$inferInsert)["status"]
) =>
  testDb
    .update(ordersServicesTable)
    .set({ status })
    .where(eq(ordersServicesTable.id, lineId));

const lineOf = (placed: Placed, serviceId: number) =>
  placed.lines.get(serviceId) as number;

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
  cleanId = shop.serviceId;
  repairId = shop.repairServiceId;

  const [bags] = await testDb
    .insert(categoriesTable)
    .values({ is_active: true, name: "Bags" })
    .returning();
  const [bagClean] = await testDb
    .insert(servicesTable)
    .values({
      category_id: bags.id,
      code: "BAGC",
      is_active: true,
      name: "Bag Clean",
      price: "80000",
    })
    .returning();
  bagCleanId = bagClean.id;

  [bintaro] = await testDb
    .insert(storesTable)
    .values({
      address: "Jl. Bintaro 1",
      code: "BTR",
      is_active: true,
      latitude: "-6.27000000",
      longitude: "106.75000000",
      name: "Fresclean Bintaro",
      phone_number: "+622187654321",
    })
    .returning();
});

// Ten Footwear Items ready 6, 12 … 60 hours after drop-off, then the odd ones.
const seedAugust = async () => {
  const steady = await placeOrder(
    shop.store,
    Array.from({ length: 10 }, (_, i) => ({
      brand: `f${i + 1}`,
      serviceIds: [cleanId],
    }))
  );
  for (let i = 1; i <= 10; i++) {
    await readyAt(lineOf(steady[`f${i}`], cleanId), afterDropOff(6 * i));
  }

  const odd = await placeOrder(shop.store, [
    // Shoes plus a bag strap: one Item in two Categories, ready with the
    // slower treatment, 72 hours in.
    { brand: "combo", serviceIds: [cleanId, bagCleanId] },
    { brand: "bag", serviceIds: [bagCleanId] },
    { brand: "early", serviceIds: [bagCleanId] },
    { brand: "late-in", serviceIds: [bagCleanId] },
    { brand: "late-out", serviceIds: [bagCleanId] },
    { brand: "reworked", serviceIds: [bagCleanId] },
    { brand: "in-workshop", serviceIds: [cleanId] },
    { brand: "half", serviceIds: [cleanId, repairId] },
    { brand: "cancelled", serviceIds: [cleanId] },
  ]);
  await readyAt(lineOf(odd.combo, cleanId), jkt("2026-08-02T10:00"));
  await readyAt(lineOf(odd.combo, bagCleanId), afterDropOff(72));
  await readyAt(lineOf(odd.bag, bagCleanId), afterDropOff(12));
  // 03:00 on the 2nd in Jakarta is still the 1st in UTC.
  await readyAt(lineOf(odd.early, bagCleanId), jkt("2026-08-02T03:00"));
  await readyAt(lineOf(odd["late-in"], bagCleanId), jkt("2026-08-05T23:30"));
  await readyAt(lineOf(odd["late-out"], bagCleanId), jkt("2026-08-06T00:30"));
  await readyAt(lineOf(odd.reworked, bagCleanId), afterDropOff(30));
  await readyAt(lineOf(odd.half, cleanId), afterDropOff(20));
  await readyAt(lineOf(odd.cancelled, cleanId), afterDropOff(8));
  await setStatus(lineOf(odd.cancelled, cleanId), "cancelled");

  // The Customer complained about the bag; the free re-clean was ready on the
  // 4th, which must not make the Item look three days slower.
  const [complaint] = await testDb
    .insert(complaintsTable)
    .values({
      opened_by: shop.cashier.id,
      order_service_id: lineOf(odd.reworked, bagCleanId),
      reason: "Still dirty",
    })
    .returning();
  const [rework] = await testDb
    .insert(ordersServicesTable)
    .values({
      complaint_id: complaint.id,
      item_id: odd.reworked.itemId,
      order_id: odd.reworked.orderId,
      price: "0",
      service_id: bagCleanId,
      status: "ready_for_pickup",
    })
    .returning();
  await readyAt(rework.id, jkt("2026-08-04T09:00"));

  const other = await placeOrder(bintaro, [
    { brand: "bintaro", serviceIds: [cleanId] },
  ]);
  await readyAt(lineOf(other.bintaro, cleanId), afterDropOff(40));
};

describe("the turnaround of Items ready in the stretch", () => {
  it("counts only Items whose every first-round line has been ready", async () => {
    await seedAugust();
    const report = await getTurnaroundReport({ ...AUGUST });

    // 10 steady + combo + bag + early + late-in + reworked + bintaro. Left out:
    // in-workshop (never ready), half (Repair still in the workshop), cancelled
    // (nothing left to be ready), late-out (ready on the 6th Jakarta time).
    expect(report.items).toHaveLength(16);
    expect(report.rows[0].name).toBe("All Items");
    expect(report.rows[0].items).toBe(16);
  });

  it("measures from the Order's drop-off to the Item's last first-ready", async () => {
    await seedAugust();
    const { items } = await getTurnaroundReport({ ...AUGUST });
    const hours = items.map((item) => item.hours).sort((a, b) => a - b);

    expect(hours).toEqual([
      6, 12, 12, 18, 18, 24, 30, 30, 36, 40, 42, 48, 54, 60, 72, 110.5,
    ]);
  });

  it("dates each Item by its Jakarta ready day", async () => {
    await seedAugust();
    const { items } = await getTurnaroundReport({ ...AUGUST });
    const byHours = (hours: number) =>
      items.find((item) => item.hours === hours);

    expect(byHours(18)?.ready_day).toBe("2026-08-02");
    expect(byHours(110.5)?.ready_day).toBe("2026-08-05");
    expect(byHours(72)?.categories.sort()).toEqual(["Bags", "Footwear"]);
    expect(byHours(72)?.services.sort()).toEqual(["Bag Clean", "Deep Clean"]);
    expect(byHours(72)?.store_code).toBe("KMG");
  });

  it("does not let a Rework make the Item slower", async () => {
    await seedAugust();
    const { items } = await getTurnaroundReport({ ...AUGUST });

    expect(items.filter((item) => item.hours === 30)).toHaveLength(2);
    expect(items.some((item) => item.hours > 110.5)).toBe(false);
  });

  it("scopes to one store", async () => {
    await seedAugust();
    const kemang = await getTurnaroundReport({
      ...AUGUST,
      store_id: shop.store.id,
    });
    const bintaroOnly = await getTurnaroundReport({
      ...AUGUST,
      store_id: bintaro.id,
    });

    expect(kemang.items).toHaveLength(15);
    expect(bintaroOnly.items.map((item) => item.hours)).toEqual([40]);
    expect(bintaroOnly.store_id).toBe(bintaro.id);
  });
});

describe("the rows", () => {
  it("lists All Items, then each Category by Item count, an Item in both", async () => {
    await seedAugust();
    const { rows } = await getTurnaroundReport({ ...AUGUST });

    expect(rows.map((row) => [row.name, row.items])).toEqual([
      ["All Items", 16],
      ["Footwear", 12],
      ["Bags", 5],
    ]);
  });

  it("shows nearest-rank percentiles once there are enough Items", async () => {
    await seedAugust();
    const { rows, min_items } = await getTurnaroundReport({ ...AUGUST });
    const footwear = rows.find((row) => row.name === "Footwear");

    expect(min_items).toBe(TURNAROUND_MIN_ITEMS);
    expect(TURNAROUND_MIN_ITEMS).toBe(10);
    // 6 12 18 24 30 36 40 42 48 54 60 72: nearest ranks 9, 11 and 12
    expect([footwear?.p75, footwear?.p90, footwear?.p99]).toEqual([48, 60, 72]);
  });

  it("withholds percentiles from a row with fewer than 10 Items", async () => {
    await seedAugust();
    const { rows } = await getTurnaroundReport({ ...AUGUST });
    const bags = rows.find((row) => row.name === "Bags");

    expect([bags?.p75, bags?.p90, bags?.p99]).toEqual([null, null, null]);
  });

  it("returns only the All Items row for an empty range", async () => {
    await seedAugust();
    const report = await getTurnaroundReport({
      from: "2026-09-01",
      to: "2026-09-05",
    });

    expect(report.items).toEqual([]);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ items: 0, p75: null });
  });
});

describe("the breakdown", () => {
  it("is the p75 of queued and in-progress hours over the counted Items' lines", async () => {
    await seedAugust();
    const { rows } = await getTurnaroundReport({ ...AUGUST });
    const all = rows[0].breakdown;

    // Every line was picked up 2 hours after drop-off. An Item with a line
    // still in the workshop (half) feeds neither the percentiles nor this
    // split; Rework and cancelled lines do not count either.
    expect(all.queued_p75).toBe(2);
    expect(all.in_progress_p75).toBe(46);
  });

  it("is null for a Category with fewer than 10 lines", async () => {
    await seedAugust();
    const { rows } = await getTurnaroundReport({ ...AUGUST });
    const bags = rows.find((row) => row.name === "Bags");

    expect(bags?.breakdown).toEqual({
      in_progress_p75: null,
      queued_p75: null,
    });
  });

  it("leaves out a ready line whose Item still has a line in the workshop", async () => {
    await seedAugust();
    const before = (await getTurnaroundReport({ ...AUGUST })).rows[0].breakdown;
    const half = await testDb.query.itemsTable.findFirst({
      where: { brand: "half" },
      with: { services: true },
    });
    // Make half's Deep Clean absurdly slow; were it counted, p75 would move.
    await testDb
      .update(orderServiceStatusLogsTable)
      .set({ created_at: afterDropOff(500) })
      .where(
        and(
          eq(
            orderServiceStatusLogsTable.order_service_id,
            half?.services.find((line) => line.service_id === cleanId)
              ?.id as number
          ),
          eq(orderServiceStatusLogsTable.to_status, "ready_for_pickup")
        )
      );
    const after = (await getTurnaroundReport({ ...AUGUST })).rows[0].breakdown;

    expect(after).toEqual(before);
  });
});
