import "@/test-support/pglite";
import { beforeEach, expect, it, mock } from "bun:test";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import { addItemPhoto, type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// The handover and the move to picked_up are one transaction, so an Item that
// already left the counter leaves no second OrderPickupEvent behind.

const STORAGE_ENV_PREFIX = "dev/";

// Taken before the mock replaces the module, so the real key checks run here.
const { assertPhotoKeyUnder, newPhotoKey } = await import("@/utils/s3");

mock.module("@/utils/s3", () => ({
  STORAGE_ENV_PREFIX,
  assertPhotoKeyUnder,
  buildMediaUrl: (path: string) => `https://cdn.test/${path}`,
  createPresignedUploadUrl: ({ key }: { key: string }) => ({
    expires_in_seconds: 300,
    key,
    upload_url: `https://s3.test/${key}`,
  }),
  newPhotoKey,
  optimizeUploadedImage: () => Promise.resolve(),
}));

// Imported after both swaps above: a static import would bind the real
// database and storage before the swaps run.
const { db } = await import("@/db");
const { createOrder } = await import("@/modules/orders/order.service");
const { createOrderPickupEvent } = await import(
  "@/modules/orders/order-pickup.service"
);
const { transitionOrderService } = await import(
  "@/modules/orders/order-status-machine"
);

let shop: Shop;

const placeOrder = (paymentStatus: "paid" | "unpaid") =>
  createOrder(shop.admin.id, shop.store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    items: [{ services: [{ id: shop.serviceId }] }],
    payment_method_id: shop.paymentMethodId,
    payment_status: paymentStatus,
    store_id: shop.store.id,
    voucher_codes: [],
  });

// Walk the Order's one OrderService to the shelf the way the workshop does:
// Item photo, start, pass quality check.
const readyForPickup = async (orderId: number) => {
  const item = await testDb.query.itemsTable.findFirst({
    where: { order_id: orderId },
  });
  if (!item) {
    throw new Error("Order has no item");
  }
  await addItemPhoto(item.id, shop.cashier.id);

  const line = await testDb.query.ordersServicesTable.findFirst({
    where: { order_id: orderId },
  });
  if (!line) {
    throw new Error("Order has no service line");
  }

  for (const to of [
    "processing",
    "quality_check",
    "ready_for_pickup",
  ] as const) {
    await transitionOrderService(db, {
      by: shop.cashier.id,
      orderId,
      serviceId: line.id,
      to,
    });
  }

  const order = await testDb.query.ordersTable.findFirst({
    where: { id: orderId },
  });

  return {
    itemId: item.id,
    pickupCode: order?.pickup_code ?? "",
    lineId: line.id,
  };
};

const handOver = (
  orderId: number,
  input: { itemId: number; pickupCode: string }
) =>
  createOrderPickupEvent({
    orderId,
    body: {
      image_path: `${STORAGE_ENV_PREFIX}orders/${orderId}/pickup/proof.webp`,
      item_ids: [input.itemId],
      pickup_code: input.pickupCode,
    },
    user: shop.cashier,
  });

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

it("refuses to hand over an order nobody has paid for", async () => {
  const order = await placeOrder("unpaid");
  const ready = await readyForPickup(order.id);

  const error = await captureRejection(handOver(order.id, ready));

  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as Error).message).toBe("Order must be paid before pickup");
});

it("refuses a pickup code that is not this order's", async () => {
  const order = await placeOrder("paid");
  const ready = await readyForPickup(order.id);
  // Derived from the real one, because the code is a random six digits and any
  // fixed string could be the one this Order was actually given.
  const wrongCode = String((Number(ready.pickupCode) + 1) % 1_000_000).padStart(
    6,
    "0"
  );

  const error = await captureRejection(
    handOver(order.id, { ...ready, pickupCode: wrongCode })
  );

  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as Error).message).toBe("Invalid pickup code");
});

it("records the handover and flips the treatment together", async () => {
  const order = await placeOrder("paid");
  const ready = await readyForPickup(order.id);

  const result = await handOver(order.id, ready);

  const events = await testDb.query.orderPickupEventsTable.findMany({
    where: { order_id: order.id },
  });
  const line = await testDb.query.ordersServicesTable.findFirst({
    where: { id: ready.lineId },
  });

  expect(events).toHaveLength(1);
  expect(result.id).toBe(events[0].id);
  expect(line?.status).toBe("picked_up");
  expect(line?.pickup_event_id).toBe(events[0].id);
});

it("refuses a second handover of the same item and files no event for it", async () => {
  const order = await placeOrder("paid");
  const ready = await readyForPickup(order.id);
  await handOver(order.id, ready);

  const error = await captureRejection(handOver(order.id, ready));

  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as Error).message).toContain("Items not ready for pickup");
  expect(
    await testDb.query.orderPickupEventsTable.findMany({
      where: { order_id: order.id },
    })
  ).toHaveLength(1);
});
