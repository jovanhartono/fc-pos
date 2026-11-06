import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import {
  complaintsTable,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
} from "@/db/schema";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// Loaded after the swap above: a static import would bind the shop's real
// database before the mock runs.
const { createOrder } = await import("@/modules/orders/order.service");
const { listTurnaroundLines } = await import(
  "@/modules/reports/turnaround.repository"
);

const HOUR_MS = 3_600_000;
const jkt = (local: string) => new Date(`${local}:00+07:00`);
const DROP_OFF = jkt("2026-08-01T09:00");
const at = (hours: number) => new Date(DROP_OFF.getTime() + hours * HOUR_MS);
const AUGUST = { end: jkt("2026-08-06T00:00"), start: jkt("2026-08-01T00:00") };

type Status = (typeof orderServiceStatusLogsTable.$inferInsert)["to_status"];

let shop: Shop;

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

const log = (lineId: number, steps: [number, Status][]) =>
  testDb.insert(orderServiceStatusLogsTable).values(
    steps.map(([hours, status]) => ({
      changed_by: shop.admin.id,
      created_at: at(hours),
      order_service_id: lineId,
      to_status: status,
    }))
  );

// Each Item gets a Deep Clean and, where asked, a Repair; returns line ids.
const placeItems = async (brands: { brand: string; repair?: boolean }[]) => {
  const order = await createOrder(shop.admin.id, shop.store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    delivery_fee: 0,
    items: brands.map(({ brand, repair }) => ({
      brand,
      services: [
        { id: shop.serviceId },
        ...(repair ? [{ id: shop.repairServiceId }] : []),
      ],
    })),
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid",
    store_id: shop.store.id,
    voucher_codes: [],
  });
  await testDb
    .update(ordersTable)
    .set({ created_at: DROP_OFF })
    .where(eq(ordersTable.id, order.id));
  const items = await testDb.query.itemsTable.findMany({
    where: { order_id: order.id },
    with: { services: true },
  });
  const line = (brand: string, serviceId: number) =>
    items
      .find((item) => item.brand === brand)
      ?.services.find((s) => s.service_id === serviceId)?.id as number;
  return {
    brandOf: new Map(items.map((item) => [item.id, item.brand])),
    clean: (brand: string) => line(brand, shop.serviceId),
    itemOf: (brand: string) =>
      items.find((item) => item.brand === brand)?.id as number,
    orderId: order.id,
    repair: (brand: string) => line(brand, shop.repairServiceId),
  };
};

const setStatus = (
  lineId: number,
  status: (typeof ordersServicesTable.$inferInsert)["status"]
) =>
  testDb
    .update(ordersServicesTable)
    .set({ status })
    .where(eq(ordersServicesTable.id, lineId));

describe("listTurnaroundLines", () => {
  it("reads each line's first pickup, first ready and shelf hours", async () => {
    const placed = await placeItems([
      { brand: "redo" },
      { brand: "tie" },
      { brand: "split", repair: true },
      { brand: "untouched", repair: true },
      { brand: "reworked" },
      { brand: "refunded", repair: true },
      { brand: "cancelled", repair: true },
      { brand: "september" },
    ]);

    // Two stretches on the shelf around a QC reject (4h + 6h), first ready at
    // +26; then sent back and ready again at +35, which must not count.
    await log(placed.clean("redo"), [
      [2, "processing"],
      [10, "waiting_qc"],
      [14, "qc_reject"],
      [15, "processing"],
      [20, "waiting_qc"],
      [26, "ready_for_pickup"],
      [30, "processing"],
      [32, "waiting_qc"],
      [35, "ready_for_pickup"],
    ]);
    // Two changes logged in the same instant: the first shelf wait ends at the
    // next later change (+7), not at its twin, so 2h + 3h.
    await log(placed.clean("tie"), [
      [2, "processing"],
      [5, "waiting_qc"],
      [5, "processing"],
      [7, "waiting_qc"],
      [10, "ready_for_pickup"],
    ]);
    // The Repair is ready on 7 August, outside the stretch, yet still listed
    // because its Deep Clean was ready inside it.
    await log(placed.clean("split"), [
      [2, "processing"],
      [12, "ready_for_pickup"],
    ]);
    await log(placed.repair("split"), [
      [3, "processing"],
      [140, "waiting_qc"],
      [150, "ready_for_pickup"],
    ]);
    // A Repair nobody has touched yet.
    await log(placed.clean("untouched"), [
      [2, "processing"],
      [12, "ready_for_pickup"],
    ]);

    await log(placed.clean("reworked"), [
      [2, "processing"],
      [12, "ready_for_pickup"],
    ]);
    const [complaint] = await testDb
      .insert(complaintsTable)
      .values({
        opened_by: shop.cashier.id,
        order_service_id: placed.clean("reworked"),
        reason: "Still dirty",
      })
      .returning();
    const [rework] = await testDb
      .insert(ordersServicesTable)
      .values({
        complaint_id: complaint.id,
        item_id: placed.itemOf("reworked"),
        order_id: placed.orderId,
        price: "0",
        service_id: shop.serviceId,
        status: "ready_for_pickup",
      })
      .returning();
    await log(rework.id, [
      [40, "processing"],
      [50, "ready_for_pickup"],
    ]);

    for (const brand of ["refunded", "cancelled"]) {
      await log(placed.clean(brand), [
        [2, "processing"],
        [12, "ready_for_pickup"],
      ]);
      await log(placed.repair(brand), [
        [2, "processing"],
        [8, "waiting_qc"],
        [14, "ready_for_pickup"],
      ]);
    }
    await setStatus(placed.repair("refunded"), "refunded");
    await setStatus(placed.repair("cancelled"), "cancelled");

    await log(placed.clean("september"), [
      [2, "processing"],
      [800, "ready_for_pickup"],
    ]);

    const rows = await listTurnaroundLines({ range: AUGUST });
    const byLine = Object.fromEntries(
      rows.map((row) => [
        `${placed.brandOf.get(row.item_id)} ${row.service_name}`,
        [row.processing_at, row.ready_at, row.waiting_qc_hours],
      ])
    );

    expect(rows).toHaveLength(Object.keys(byLine).length);
    expect(byLine).toEqual({
      "cancelled Deep Clean": [at(2), at(12), 0],
      "redo Deep Clean": [at(2), at(26), 10],
      "refunded Deep Clean": [at(2), at(12), 0],
      "reworked Deep Clean": [at(2), at(12), 0],
      "split Deep Clean": [at(2), at(12), 0],
      "split Repair": [at(3), at(150), 10],
      "tie Deep Clean": [at(2), at(10), 5],
      "untouched Deep Clean": [at(2), at(12), 0],
      "untouched Repair": [null, null, 0],
    });
    expect(rows[0]).toMatchObject({
      is_priority: false,
      order_created_at: DROP_OFF,
      store_code: shop.store.code,
    });
    expect(
      await listTurnaroundLines({ range: AUGUST, storeId: shop.store.id })
    ).toHaveLength(rows.length);
    expect(
      await listTurnaroundLines({ range: AUGUST, storeId: shop.store.id + 1 })
    ).toEqual([]);
  });

  it("keeps a still-on-the-shelf wait out of the hours", async () => {
    const placed = await placeItems([{ brand: "shelf", repair: true }]);
    await log(placed.clean("shelf"), [
      [2, "processing"],
      [12, "ready_for_pickup"],
    ]);
    await log(placed.repair("shelf"), [
      [3, "processing"],
      [20, "waiting_qc"],
    ]);

    const rows = await listTurnaroundLines({ range: AUGUST });

    expect(
      rows.map((row) => [row.processing_at, row.ready_at, row.waiting_qc_hours])
    ).toContainEqual([at(3), null, 0]);
  });
});
