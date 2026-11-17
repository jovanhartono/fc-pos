import { beforeEach, expect, it } from "bun:test";

import "@/test-support/pglite";

import { eq } from "drizzle-orm";

import { ordersServicesTable, ordersTable } from "@/db/schema";
import { seedShop } from "@/test-support/fixtures";
import type { Shop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// Imported after the swap above: a static import would bind the shop's real
// database before the swap runs.
const { createOrder } = await import("@/modules/orders/order.service");
const { countOrdersByStatus, findOrders } =
  await import("@/modules/orders/order.repository");

let shop: Shop;

const dropOff = (name: string) =>
  createOrder(shop.cashier.id, shop.store, {
    campaign_ids: [],
    customer: { name, phone_number: `+62811${name.length}000111` },
    discount: 0,
    delivery_fee: 0,
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

const listUnpaid = (status?: "cancelled") =>
  findOrders({
    limit: 10,
    offset: 0,
    payment_status: "unpaid",
    sort_by: "created_at",
    sort_order: "desc",
    status,
  });

it("leaves cancelled Orders off the Unpaid list", async () => {
  const owing = await dropOff("Budi");
  const cancelled = await dropOff("Rina Wati");
  await testDb
    .update(ordersTable)
    .set({ status: "cancelled" })
    .where(eq(ordersTable.id, cancelled.id));

  const unpaid = await listUnpaid();
  expect(unpaid.items.map((order) => order.id)).toEqual([owing.id]);
  expect(unpaid.total).toBe(1);
  const unpaidCancelled = await listUnpaid("cancelled");
  expect(unpaidCancelled.total).toBe(0);
});

const listAll = () =>
  findOrders({
    limit: 10,
    offset: 0,
    sort_by: "created_at",
    sort_order: "desc",
  });

it("counts a pair as ready only when all its live treatments are", async () => {
  const order = await createOrder(shop.cashier.id, shop.store, {
    campaign_ids: [],
    customer: { name: "Sari", phone_number: "+6281100022233" },
    discount: 0,
    delivery_fee: 0,
    items: [
      { brand: "Nike", services: [{ id: shop.serviceId }] },
      {
        brand: "Coach",
        services: [{ id: shop.serviceId }, { id: shop.serviceId }],
      },
    ],
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid",
    store_id: shop.store.id,
    voucher_codes: [],
  });
  const lines = await testDb
    .select()
    .from(ordersServicesTable)
    .where(eq(ordersServicesTable.order_id, order.id))
    .orderBy(ordersServicesTable.id);
  const [nike, coachClean, coachRepaint] = lines;
  if (!(nike && coachClean && coachRepaint)) {
    throw new Error("expected three lines");
  }

  // The Nike is done; the Coach still has one OrderService in the workshop.
  await testDb
    .update(ordersServicesTable)
    .set({ status: "ready_for_pickup" })
    .where(eq(ordersServicesTable.id, nike.id));
  await testDb
    .update(ordersServicesTable)
    .set({ status: "ready_for_pickup" })
    .where(eq(ordersServicesTable.id, coachClean.id));
  const { items: before } = await listAll();
  expect([before[0]?.items_ready, before[0]?.items_total]).toEqual([1, 2]);

  // A refunded OrderService no longer holds the Coach back.
  await testDb
    .update(ordersServicesTable)
    .set({ status: "refunded" })
    .where(eq(ordersServicesTable.id, coachRepaint.id));
  const { items: after } = await listAll();
  expect([after[0]?.items_ready, after[0]?.items_total]).toEqual([2, 2]);
});

const payWithRefund = (id: number, refunded: string) =>
  testDb
    .update(ordersTable)
    .set({
      paid_amount: "100000",
      payment_status: "paid",
      refunded_amount: refunded,
    })
    .where(eq(ordersTable.id, id));

const listByRefundStatus = (refund_status: "any" | "partial" | "full") =>
  findOrders({
    limit: 10,
    offset: 0,
    refund_status,
    sort_by: "created_at",
    sort_order: "desc",
  });

// An owner looking back at refunds: a part refund and a whole one are
// different conversations with the customer, so each filter finds only its own.
it("finds Orders by how much of their money went back", async () => {
  const [none, part, all] = await Promise.all([
    dropOff("Budi"),
    dropOff("Rina Wati"),
    dropOff("Joko Susilo"),
  ]);
  await payWithRefund(none.id, "0");
  await payWithRefund(part.id, "40000");
  await payWithRefund(all.id, "100000");

  const partial = await listByRefundStatus("partial");
  expect(partial.items.map((order) => order.id)).toEqual([part.id]);
  const full = await listByRefundStatus("full");
  expect(full.items.map((order) => order.id)).toEqual([all.id]);
  const any = await listByRefundStatus("any");
  expect(any.items.map((order) => order.id).toSorted((a, b) => a - b)).toEqual(
    [part.id, all.id].toSorted((a, b) => a - b)
  );
});

const setPaidAt = (id: number, at: string) =>
  testDb
    .update(ordersTable)
    .set({ paid_at: new Date(at), payment_status: "paid" })
    .where(eq(ordersTable.id, id));

const listIdsPaidBetween = async (paid_from?: string, paid_to?: string) => {
  const page = await findOrders({
    limit: 10,
    offset: 0,
    paid_from,
    paid_to,
    sort_by: "id",
    sort_order: "asc",
  });
  return page.items.map((order) => order.id);
};

// Paid at 23:30 on Oct 31 in Jakarta, which is already Oct 31 16:30 UTC: it
// belongs to that day's money, not Nov 1's.
it("finds Orders by the Jakarta day they were paid", async () => {
  const [lateNight, nextDay] = await Promise.all([
    dropOff("Budi"),
    dropOff("Rina Wati"),
    dropOff("Joko Susilo"),
  ]);
  await setPaidAt(lateNight.id, "2026-10-31T16:30:00Z");
  await setPaidAt(nextDay.id, "2026-10-31T17:30:00Z");

  expect(await listIdsPaidBetween("2026-10-31", "2026-10-31")).toEqual([
    lateNight.id,
  ]);
  expect(await listIdsPaidBetween("2026-11-01")).toEqual([nextDay.id]);
  expect(await listIdsPaidBetween(undefined, "2026-11-01")).toEqual([
    lateNight.id,
    nextDay.id,
  ]);
});

it("counts every status under the other filters, ignoring the status one", async () => {
  await dropOff("Budi");
  const cancelled = await dropOff("Rina Wati");
  await testDb
    .update(ordersTable)
    .set({ status: "cancelled" })
    .where(eq(ordersTable.id, cancelled.id));

  expect(await countOrdersByStatus({ status: "processing" })).toEqual({
    created: 1,
    processing: 0,
    ready_for_pickup: 0,
    completed: 0,
    cancelled: 1,
  });
  // Unpaid already leaves cancelled Orders out, so its tab reads 0.
  const unpaidCounts = await countOrdersByStatus({ payment_status: "unpaid" });
  expect(unpaidCounts.cancelled).toBe(0);
});
