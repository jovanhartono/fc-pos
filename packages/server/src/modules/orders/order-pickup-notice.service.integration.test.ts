import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { orderPickupNoticesTable, ordersTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// Loaded after the swap above, never beside the imports (see order-list).
const { createOrder } = await import("@/modules/orders/order.service");
const { findOrders } = await import("@/modules/orders/order.repository");
const { createOrderPickupNotice } = await import(
  "@/modules/orders/order-pickup-notice.service"
);

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

const markReady = (orderId: number) =>
  testDb
    .update(ordersTable)
    .set({ status: "ready_for_pickup" })
    .where(eq(ordersTable.id, orderId));

const noticesOf = (orderId: number) =>
  testDb
    .select()
    .from(orderPickupNoticesTable)
    .where(eq(orderPickupNoticesTable.order_id, orderId));

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

describe("createOrderPickupNotice", () => {
  it("refuses while the Order is still in the workshop", async () => {
    const order = await dropOff("Budi");

    await expect(
      createOrderPickupNotice({ orderId: order.id, user: shop.cashier })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await noticesOf(order.id)).toHaveLength(0);
  });

  it("records every send, so Notify again adds a second row", async () => {
    const order = await dropOff("Budi");
    await markReady(order.id);

    await createOrderPickupNotice({ orderId: order.id, user: shop.cashier });
    await createOrderPickupNotice({ orderId: order.id, user: shop.admin });

    expect((await noticesOf(order.id)).map((notice) => notice.sent_by)).toEqual(
      [shop.cashier.id, shop.admin.id]
    );
  });
});

describe("the notified list filter", () => {
  it("splits ready Orders by whether a notice went out", async () => {
    const notified = await dropOff("Budi");
    const waiting = await dropOff("Rina Wati");
    await markReady(notified.id);
    await markReady(waiting.id);
    await createOrderPickupNotice({
      orderId: notified.id,
      user: shop.cashier,
    });

    const list = (value?: "yes" | "no") =>
      findOrders({
        limit: 10,
        notified: value,
        offset: 0,
        sort_by: "id",
        sort_order: "asc",
        status: "ready_for_pickup",
      });

    expect((await list("yes")).items.map((order) => order.id)).toEqual([
      notified.id,
    ]);
    expect((await list("no")).items.map((order) => order.id)).toEqual([
      waiting.id,
    ]);
    expect(
      (await list()).items.map((order) => [order.id, order.notified])
    ).toEqual([
      [notified.id, true],
      [waiting.id, false],
    ]);
  });

  it("leaves collected and cancelled Orders out of both lists", async () => {
    const collected = await dropOff("Budi");
    const cancelled = await dropOff("Rina Wati");
    await markReady(collected.id);
    await markReady(cancelled.id);
    await createOrderPickupNotice({
      orderId: collected.id,
      user: shop.cashier,
    });
    await testDb
      .update(ordersTable)
      .set({ status: "completed" })
      .where(eq(ordersTable.id, collected.id));
    await testDb
      .update(ordersTable)
      .set({ status: "cancelled" })
      .where(eq(ordersTable.id, cancelled.id));

    const list = (value?: "yes" | "no") =>
      findOrders({
        limit: 10,
        notified: value,
        offset: 0,
        sort_by: "id",
        sort_order: "asc",
      });

    expect((await list("yes")).items).toHaveLength(0);
    expect((await list("no")).items).toHaveLength(0);
    expect((await list()).items.map((order) => order.notified)).toEqual([
      false,
      false,
    ]);
  });
});
