import "@/test-support/pglite";
import { beforeEach, expect, it, mock } from "bun:test";
import { addItemPhoto, type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// The three Order reads against a real Postgres, checked for the one thing a
// column list gets wrong silently: who is allowed to see the pickup code, the
// six digits that release someone's shoes at the counter (ADR-0005/0016).

mock.module("@/utils/s3", () => ({
  STORAGE_ENV_PREFIX: "dev/",
  buildMediaUrl: (path: string | null) =>
    path ? `https://cdn.test/${path}` : null,
  createPresignedUploadUrl: ({ key }: { key: string }) => ({
    expires_in_seconds: 300,
    key,
    upload_url: `https://s3.test/${key}`,
  }),
  optimizeUploadedImage: () => Promise.resolve(),
}));

// Loaded after both swaps above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the shop's real database and the real storage module.
const { db } = await import("@/db");
const { createOrder, getOrderDetailById } = await import(
  "@/modules/orders/order.service"
);
const { getOrderReceiptById } = await import(
  "@/modules/orders/order-receipt.service"
);
const { getOrderServiceDetail } = await import(
  "@/modules/orders/order-service-detail.service"
);
const { getTrackedOrder } = await import(
  "@/modules/orders/order-track.service"
);
const { transitionOrderService } = await import(
  "@/modules/orders/order-status-machine"
);

const CUSTOMER_PHONE = "+628111222333";

let shop: Shop;

const placeOrder = () =>
  createOrder(shop.admin.id, shop.store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: CUSTOMER_PHONE },
    discount: 0,
    items: [{ services: [{ id: shop.serviceId }] }],
    payment_method_id: shop.paymentMethodId,
    payment_status: "paid",
    store_id: shop.store.id,
    voucher_codes: [],
  });

// Walk the one treatment on the Order to the shelf, the way the workshop does:
// photograph the object, start it, pass QC.
const putOnTheShelf = async (orderId: number) => {
  const item = await testDb.query.itemsTable.findFirst({
    where: { order_id: orderId },
  });
  const line = await testDb.query.ordersServicesTable.findFirst({
    where: { order_id: orderId },
  });
  if (!(item && line)) {
    throw new Error("Order has no item or service line");
  }
  await addItemPhoto(item.id, shop.cashier.id);

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
};

const storedPickupCode = async (orderId: number) => {
  const row = await testDb.query.ordersTable.findFirst({
    where: { id: orderId },
  });
  if (!row) {
    throw new Error("Order not found");
  }
  return row.pickup_code;
};

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

it("keeps the pickup code out of the admin order detail", async () => {
  const order = await placeOrder();

  const detail = await getOrderDetailById(order.id);

  expect(detail).not.toBeNull();
  expect(detail).not.toHaveProperty("pickup_code");
  // The bucket key and the raw handover rows are shop-internal; the detail
  // sends a photo URL and a shaped pickup_events list instead.
  expect(detail).not.toHaveProperty("dropoff_photo_path");
  expect(detail).not.toHaveProperty("pickupEvents");
});

it("prints the pickup code on the receipt", async () => {
  const order = await placeOrder();

  const receipt = await getOrderReceiptById(order.id);

  expect(receipt?.pickup_code).toBe(await storedPickupCode(order.id));
});

it("hides the pickup code from the tracker until an object can be collected", async () => {
  const order = await placeOrder();

  const inTheShop = await getTrackedOrder({
    code: order.code,
    phone_number: CUSTOMER_PHONE,
  });
  await putOnTheShelf(order.id);
  const onTheShelf = await getTrackedOrder({
    code: order.code,
    phone_number: CUSTOMER_PHONE,
  });

  expect(inTheShop.pickup_code).toBeNull();
  expect(onTheShelf.pickup_code).toBe(await storedPickupCode(order.id));
});

it("gates the start-photo flag on the queue's line detail the way the shop does", async () => {
  const order = await placeOrder();
  const line = await testDb.query.ordersServicesTable.findFirst({
    where: { order_id: order.id },
  });
  const item = await testDb.query.itemsTable.findFirst({
    where: { order_id: order.id },
  });
  if (!(line && item)) {
    throw new Error("Order has no item or service line");
  }

  const beforePhoto = await getOrderServiceDetail(order.id, line.id);
  expect(beforePhoto?.line.has_start_photo).toBe(false);

  await addItemPhoto(item.id, shop.cashier.id);

  const afterPhoto = await getOrderServiceDetail(order.id, line.id);
  expect(afterPhoto?.line.has_start_photo).toBe(true);
  expect(afterPhoto).not.toHaveProperty("pickup_code");
  expect(JSON.stringify(afterPhoto)).not.toContain("pickup_code");
});

it("masks the phone number the tracker echoes back", async () => {
  const order = await placeOrder();

  const tracked = await getTrackedOrder({
    code: order.code,
    phone_number: CUSTOMER_PHONE,
  });

  expect(tracked.customer.phone_number_masked).toBe("******2333");
  expect(tracked.customer).not.toHaveProperty("phone_number");
});
