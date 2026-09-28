import "@/test-support/pglite";
import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { ordersTable } from "@/db/schema";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// Loaded after the swap above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the shop's real database.
const { createOrder } = await import("@/modules/orders/order.service");
const { findOrders } = await import("@/modules/orders/order.repository");

let shop: Shop;

const dropOff = (name: string) =>
  createOrder(shop.cashier.id, shop.store, {
    campaign_ids: [],
    customer: { name, phone_number: `+62811${name.length}000111` },
    discount: 0,
    items: [{ brand: name, services: [{ id: shop.serviceId }] }],
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid",
    store_id: shop.store.id,
    voucher_codes: [],
  });

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

it("leaves cancelled Orders off the Unpaid list", async () => {
  const owing = await dropOff("Budi");
  const cancelled = await dropOff("Rina Wati");
  await testDb
    .update(ordersTable)
    .set({ status: "cancelled" })
    .where(eq(ordersTable.id, cancelled.id));

  const list = (status?: "cancelled") =>
    findOrders({
      limit: 10,
      offset: 0,
      payment_status: "unpaid",
      sort_by: "created_at",
      sort_order: "desc",
      status,
    });

  const unpaid = await list();
  expect(unpaid.items.map((order) => order.id)).toEqual([owing.id]);
  expect(unpaid.total).toBe(1);
  expect((await list("cancelled")).total).toBe(0);
});
