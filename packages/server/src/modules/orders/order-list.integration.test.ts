import "@/test-support/pglite";
import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { ordersServicesTable, ordersTable } from "@/db/schema";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// Loaded after the swap above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the shop's real database.
const { createOrder } = await import("@/modules/orders/order.service");
const { countOrdersByStatus, findOrders } = await import(
  "@/modules/orders/order.repository"
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

  // The Nike is done; the Coach still has one treatment in the workshop.
  await testDb
    .update(ordersServicesTable)
    .set({ status: "ready_for_pickup" })
    .where(eq(ordersServicesTable.id, nike.id));
  await testDb
    .update(ordersServicesTable)
    .set({ status: "ready_for_pickup" })
    .where(eq(ordersServicesTable.id, coachClean.id));
  let [row] = (await listAll()).items;
  expect([row?.items_ready, row?.items_total]).toEqual([1, 2]);

  // A refunded treatment no longer holds the Coach back.
  await testDb
    .update(ordersServicesTable)
    .set({ status: "refunded" })
    .where(eq(ordersServicesTable.id, coachRepaint.id));
  [row] = (await listAll()).items;
  expect([row?.items_ready, row?.items_total]).toEqual([2, 2]);
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
  expect(
    (await countOrdersByStatus({ payment_status: "unpaid" })).cancelled
  ).toBe(0);
});
