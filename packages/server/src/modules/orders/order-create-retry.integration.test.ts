import { beforeEach, expect, it } from "bun:test";

import "@/test-support/pglite";
import { ordersTable, storesTable } from "@/db/schema";
import { seedShop } from "@/test-support/fixtures";
import type { Shop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// The counter's connection drops the reply after the Order is saved, the POS
// shows an error, and the cashier taps Create Order again for the same cart.

// Imported after the swap above: a static import would bind the shop's real
// database before the swap runs.
const { createOrder } = await import("@/modules/orders/order.service");

let shop: Shop;

const checkout = (requestId: string, store = shop.store) =>
  createOrder(shop.cashier.id, store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    delivery_fee: 0,
    items: [{ brand: "Nike", services: [{ id: shop.serviceId }] }],
    payment_method_id: shop.paymentMethodId,
    payment_status: "paid",
    request_id: requestId,
    store_id: store.id,
    voucher_codes: [],
  });

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

it("answers a repeated tap for the same cart with the Order already saved", async () => {
  const first = await checkout("6f1c1f9e-2b7a-4d3e-9a51-0c2d8e4b7f10");
  const retry = await checkout("6f1c1f9e-2b7a-4d3e-9a51-0c2d8e4b7f10");

  expect(retry).toEqual(first);
  expect(await testDb.$count(ordersTable)).toBe(1);
});

it("answers a tap made while the first is still saving with that Order", async () => {
  const [first, retry] = await Promise.all([
    checkout("6f1c1f9e-2b7a-4d3e-9a51-0c2d8e4b7f10"),
    checkout("6f1c1f9e-2b7a-4d3e-9a51-0c2d8e4b7f10"),
  ]);

  expect(retry).toEqual(first);
  expect(await testDb.$count(ordersTable)).toBe(1);
});

it("never hands one Store's Order to a checkout at another Store", async () => {
  const [otherStore] = await testDb
    .insert(storesTable)
    .values({
      address: "Jl. Senopati 2",
      code: "SNP",
      is_active: true,
      latitude: "-6.23000000",
      longitude: "106.80000000",
      name: "Fresclean Senopati",
      phone_number: "+622187654321",
    })
    .returning();

  await checkout("6f1c1f9e-2b7a-4d3e-9a51-0c2d8e4b7f10");

  await expect(
    checkout("6f1c1f9e-2b7a-4d3e-9a51-0c2d8e4b7f10", otherStore)
  ).rejects.toThrow();
  expect(await testDb.$count(ordersTable)).toBe(1);
});

it("saves a new Order for the next cart", async () => {
  await checkout("6f1c1f9e-2b7a-4d3e-9a51-0c2d8e4b7f10");
  await checkout("0b9e3a52-7c41-4f8d-b6e2-91a4c5d3e872");

  expect(await testDb.$count(ordersTable)).toBe(2);
});
