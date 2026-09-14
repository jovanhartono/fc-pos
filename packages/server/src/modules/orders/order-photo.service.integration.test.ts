import "@/test-support/pglite";
import { beforeEach, expect, it, mock } from "bun:test";
import { captureRejection } from "@/test-support/capture-rejection";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// Saving an Item photo against a real Postgres: the row lands, and the
// queued -> processing gate (ADR-0012) reads it back and unlocks.

// Dev and production file into one bucket under their own prefix, so every key
// the counter issues or accepts carries one.
const STORAGE_ENV_PREFIX = "dev/";

// Captured before the mock below replaces the module: pure key/scope logic with
// no S3 or DB of their own, so the real implementation runs here rather than a copy of it.
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

// Loaded after the swap above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the real storage module.
const { db } = await import("@/db");
const { createOrder } = await import("@/modules/orders/order.service");
const { saveItemPhoto } = await import("@/modules/orders/order-photo.service");
const { transitionOrderService } = await import(
  "@/modules/orders/order-status-machine"
);
const { BadRequestException } = await import("@/http-exceptions");

let shop: Shop;

const placeOrder = () =>
  createOrder(shop.admin.id, shop.store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    items: [{ services: [{ id: shop.serviceId }] }],
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid",
    store_id: shop.store.id,
    voucher_codes: [],
  });

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

it("writes the row and flips the start-photo gate", async () => {
  const order = await placeOrder();
  const item = await testDb.query.itemsTable.findFirst({
    where: { order_id: order.id },
  });
  const line = await testDb.query.ordersServicesTable.findFirst({
    where: { order_id: order.id },
  });
  if (!(item && line)) {
    throw new Error("Order has no item or service line");
  }

  const stillBlocked = await captureRejection(
    transitionOrderService(db, {
      by: shop.cashier.id,
      orderId: order.id,
      serviceId: line.id,
      to: "processing",
    })
  );
  expect(stillBlocked).toBeInstanceOf(BadRequestException);

  const photo = await saveItemPhoto({
    body: {
      image_path: newPhotoKey({
        itemId: item.id,
        kind: "item",
        orderId: order.id,
      }),
    },
    itemId: item.id,
    orderId: order.id,
    user: shop.cashier,
  });

  const rows = await testDb.query.itemImagesTable.findMany({
    where: { item_id: item.id },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].image_path).toBe(photo.image_path);

  await transitionOrderService(db, {
    by: shop.cashier.id,
    orderId: order.id,
    serviceId: line.id,
    to: "processing",
  });

  const updated = await testDb.query.ordersServicesTable.findFirst({
    where: { id: line.id },
  });
  expect(updated?.status).toBe("processing");
});
