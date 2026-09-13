import "@/test-support/pglite";
import { beforeEach, expect, it } from "bun:test";
import {
  complaintsTable,
  itemImagesTable,
  ordersServicesTable,
} from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import { addItemPhoto, type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// The photo gate against a real Postgres (ADR-0012, ADR-0019): whether the
// workshop may start on an object depends on rows in two tables and how their
// timestamps sit against each other, which is exactly what a double flattens.

// Loaded after the swap above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the shop's real database.
const { db } = await import("@/db");
const { createOrder } = await import("@/modules/orders/order.service");
const { transitionOrderService } = await import(
  "@/modules/orders/order-status-machine"
);

let shop: Shop;

const COMPLAINT_OPENED_AT = new Date("2026-09-01T03:00:00Z");
const FIRST_VISIT_AT = new Date("2026-08-01T03:00:00Z");
const CAME_BACK_AT = new Date("2026-09-01T04:00:00Z");

const placeOrder = async () => {
  const order = await createOrder(shop.admin.id, shop.store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    items: [{ services: [{ id: shop.serviceId }] }],
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid",
    store_id: shop.store.id,
    voucher_codes: [],
  });

  const line = await testDb.query.ordersServicesTable.findFirst({
    where: { order_id: order.id },
  });
  if (!line) {
    throw new Error("Order has no service line");
  }

  return { line, orderId: order.id };
};

const startWork = (orderId: number, serviceId: number) =>
  transitionOrderService(db, {
    by: shop.cashier.id,
    orderId,
    serviceId,
    to: "processing",
  });

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

it("refuses to start work on an item nobody photographed", async () => {
  const { line, orderId } = await placeOrder();

  const error = await captureRejection(startWork(orderId, line.id));

  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as Error).message).toBe(
    "Add an item photo before starting work"
  );
});

it("starts work once the item has been photographed", async () => {
  const { line, orderId } = await placeOrder();
  await addItemPhoto(line.item_id, shop.cashier.id);

  await startWork(orderId, line.id);

  const updated = await testDb.query.ordersServicesTable.findFirst({
    where: { id: line.id },
  });

  expect(updated?.status).toBe("processing");
});

it("ignores the first visit's photos when starting a rework", async () => {
  const { line, orderId } = await placeOrder();

  await testDb.insert(itemImagesTable).values({
    created_at: FIRST_VISIT_AT,
    image_path: "dev/orders/items/first-visit.webp",
    item_id: line.item_id,
    uploaded_by: shop.cashier.id,
  });

  const [complaint] = await testDb
    .insert(complaintsTable)
    .values({
      created_at: COMPLAINT_OPENED_AT,
      opened_by: shop.cashier.id,
      order_service_id: line.id,
      reason: "Still stained along the midsole",
    })
    .returning();

  const [rework] = await testDb
    .insert(ordersServicesTable)
    .values({
      cogs_snapshot: "0",
      complaint_id: complaint.id,
      is_priority: true,
      item_id: line.item_id,
      order_id: orderId,
      price: "0",
      service_id: line.service_id,
      status: "queued",
    })
    .returning();

  const error = await captureRejection(startWork(orderId, rework.id));

  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as Error).message).toBe(
    "Add a photo of the returned item before starting the rework"
  );

  await testDb.insert(itemImagesTable).values({
    created_at: CAME_BACK_AT,
    image_path: "dev/orders/items/came-back.webp",
    item_id: line.item_id,
    uploaded_by: shop.cashier.id,
  });

  await startWork(orderId, rework.id);

  const updated = await testDb.query.ordersServicesTable.findFirst({
    where: { id: rework.id },
  });

  expect(updated?.status).toBe("processing");
});
