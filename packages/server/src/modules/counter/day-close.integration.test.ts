import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import {
  complaintsTable,
  orderPickupEventsTable,
  orderRefundItemsTable,
  orderRefundsTable,
  ordersServicesTable,
  ordersTable,
  paymentMethodsTable,
  storesTable,
} from "@/db/schema";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// What the owner checks at closing time: the money against the card-terminal
// slips, then what was dropped off and picked up that Jakarta day.

// Loaded after the swap above, never beside the imports (see the Workers suite).
const { createOrder } = await import("@/modules/orders/order.service");
const { getDayClose } = await import("@/modules/counter/day-close.service");

const jkt = (local: string) => new Date(`${local}:00+07:00`);

const DAY = "2026-09-30";

type Store = Shop["store"];

let shop: Shop;
let bintaro: Store;
let cardMethodId: number;

interface Placed {
  itemIds: number[];
  lineIds: number[];
  orderId: number;
}

interface Options {
  createdAt?: string;
  discount?: string;
  items?: number;
  methodId?: number | null;
  paidAt?: string;
  store?: Store;
}

// Each Item carries one Deep Clean (100,000), so an Order of n Items totals n x 100,000.
const place = async ({
  createdAt = `${DAY}T10:00`,
  discount = "0",
  items = 1,
  methodId,
  paidAt,
  store = shop.store,
}: Options = {}): Promise<Placed> => {
  const order = await createOrder(shop.admin.id, store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    items: Array.from({ length: items }, (_, index) => ({
      brand: `item-${index}`,
      services: [{ id: shop.serviceId }],
    })),
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid",
    store_id: store.id,
    voucher_codes: [],
  });

  const total = items * 100_000;
  await testDb
    .update(ordersTable)
    .set({
      created_at: jkt(createdAt),
      discount,
      ...(paidAt
        ? {
            paid_amount: String(total - Number(discount)),
            paid_at: jkt(paidAt),
            paid_by: shop.cashier.id,
            payment_method_id:
              methodId === undefined ? shop.paymentMethodId : methodId,
            payment_status: "paid" as const,
          }
        : {}),
    })
    .where(eq(ordersTable.id, order.id));

  const rows = await testDb.query.ordersServicesTable.findMany({
    where: { order_id: order.id },
    orderBy: { id: "asc" },
  });
  return {
    itemIds: rows.map((row) => row.item_id),
    lineIds: rows.map((row) => row.id),
    orderId: order.id,
  };
};

const closeOf = (store = shop.store) => getDayClose(store.id, DAY);

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
  [bintaro] = await testDb
    .insert(storesTable)
    .values({
      address: "Jl. Bintaro 1",
      code: "BTR",
      is_active: true,
      latitude: "-6.27000000",
      longitude: "106.75000000",
      name: "Fresclean Bintaro",
      phone_number: "+622187654321",
    })
    .returning();
  const [card] = await testDb
    .insert(paymentMethodsTable)
    .values({ code: "CARD", is_active: false, name: "Card" })
    .returning();
  cardMethodId = card.id;
});

describe("the money collected", () => {
  it("keeps a payment at 23:30 on its day and leaves 00:10 to the next", async () => {
    await place({ paidAt: `${DAY}T23:30` });
    await place({ paidAt: "2026-10-01T00:10" });

    const { collected, payments } = await closeOf();

    expect(collected.payments).toBe(1);
    expect(collected.amount).toBe(100_000);
    expect(payments.map((p) => p.recorded_by)).toEqual(["Cahya Cashier"]);
  });

  it("splits this day's Orders from earlier ones paid later", async () => {
    await place({ paidAt: `${DAY}T11:00` });
    await place({ items: 2, paidAt: `${DAY}T12:00` });
    await place({ createdAt: "2026-09-28T10:00", paidAt: `${DAY}T13:00` });

    const { collected, payments } = await closeOf();

    expect(collected.amount).toBe(400_000);
    expect(collected.this_day).toEqual({ amount: 300_000, payments: 2 });
    expect(collected.earlier).toEqual({ amount: 100_000, payments: 1 });
    expect(payments.at(-1)?.created_day).toBe("2026-09-28");
  });

  it("counts net of discount, per method, with inactive methods and a no-method row", async () => {
    await place({ discount: "10000", paidAt: `${DAY}T10:30` });
    await place({ methodId: cardMethodId, paidAt: `${DAY}T11:00` });
    await place({ methodId: cardMethodId, paidAt: `${DAY}T11:30` });
    await place({ methodId: null, paidAt: `${DAY}T12:00` });

    const { collected, methods } = await closeOf();

    expect(collected.amount).toBe(390_000);
    expect(methods).toEqual([
      {
        amount: 90_000,
        name: "Cash",
        payment_method_id: shop.paymentMethodId,
        payments: 1,
      },
      {
        amount: 200_000,
        name: "Card",
        payment_method_id: cardMethodId,
        payments: 2,
      },
      {
        amount: 100_000,
        name: "No PaymentMethod",
        payment_method_id: null,
        payments: 1,
      },
    ]);
  });

  it("lists a refund on its own line without subtracting it from any method", async () => {
    const paid = await place({
      createdAt: "2026-09-29T10:00",
      paidAt: "2026-09-29T10:30",
    });
    const [refund] = await testDb
      .insert(orderRefundsTable)
      .values({
        created_at: jkt(`${DAY}T15:00`),
        order_id: paid.orderId,
        refunded_by: shop.admin.id,
        total_amount: "100000",
      })
      .returning();
    await testDb.insert(orderRefundItemsTable).values([
      {
        amount: "50000",
        order_refund_id: refund.id,
        order_service_id: paid.lineIds[0],
        reason: "damaged",
      },
      {
        amount: "50000",
        order_refund_id: refund.id,
        order_service_id: paid.lineIds[0],
        reason: "damaged",
      },
    ]);
    await place({ paidAt: `${DAY}T10:00` });

    const { methods, refunds } = await closeOf();

    expect(methods).toHaveLength(1);
    expect(methods[0].amount).toBe(100_000);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      amount: 100_000,
      order_id: paid.orderId,
      paid_day: "2026-09-29",
      payment_method_name: "Cash",
      reasons: ["damaged"],
    });
  });

  it("leaves another Store's takings out", async () => {
    await place({ paidAt: `${DAY}T10:00` });
    await place({ paidAt: `${DAY}T10:00`, store: bintaro });

    expect((await closeOf()).collected.payments).toBe(1);
    expect((await closeOf(bintaro)).collected.payments).toBe(1);
  });
});

describe("what was dropped off", () => {
  it("counts Orders, Items and Services, leaving Reworks out", async () => {
    const order = await place({ items: 2 });
    const [complaint] = await testDb
      .insert(complaintsTable)
      .values({
        opened_by: shop.admin.id,
        order_service_id: order.lineIds[0],
        reason: "Stain",
      })
      .returning();
    await testDb.insert(ordersServicesTable).values({
      complaint_id: complaint.id,
      item_id: order.itemIds[0],
      order_id: order.orderId,
      price: "0",
      service_id: shop.serviceId,
      status: "queued",
    });
    await place({ createdAt: "2026-09-29T23:59" });

    const { dropped_off } = await closeOf();

    expect(dropped_off).toMatchObject({
      items: 2,
      orders: 1,
      products: 0,
      services: 2,
    });
    expect(dropped_off.categories).toEqual([
      {
        count: 2,
        name: "Footwear",
        services: [{ count: 2, name: "Deep Clean" }],
      },
    ]);
    expect(dropped_off.order_list[0]).toMatchObject({
      amount: 200_000,
      is_paid: false,
      items: 2,
      is_cancelled: false,
      paid_day: null,
    });
  });

  it("names how each Order was paid: same day, a later day, or not yet", async () => {
    const same = await place({ paidAt: `${DAY}T11:00` });
    const later = await place({ paidAt: "2026-10-01T09:00" });
    const none = await place();

    const { dropped_off } = await closeOf();
    const row = (id: number) =>
      dropped_off.order_list.find((o) => o.order_id === id);

    expect(row(same.orderId)).toMatchObject({
      is_paid: true,
      paid_day: null,
      payment_method_name: "Cash",
    });
    expect(row(later.orderId)).toMatchObject({
      is_paid: false,
      paid_day: "2026-10-01",
      payment_method_name: null,
    });
    expect(row(none.orderId)?.is_paid).toBe(false);
  });

  const cancelAt = async (orderId: number, local: string) => {
    await testDb
      .update(ordersTable)
      .set({ cancelled_at: jkt(local), status: "cancelled" })
      .where(eq(ordersTable.id, orderId));
  };

  it("counts a cancelled Order as dropped off but not as unpaid", async () => {
    const cancelled = await place();
    await cancelAt(cancelled.orderId, `${DAY}T15:00`);

    const { dropped_off, unpaid } = await closeOf();

    expect(dropped_off.orders).toBe(1);
    expect(dropped_off.order_list[0]?.is_cancelled).toBe(true);
    expect(unpaid).toEqual({ amount: 0, orders: 0 });
  });

  it("keeps an Order cancelled on a later day as unpaid on its own day", async () => {
    const order = await place();
    await cancelAt(order.orderId, "2026-10-02T10:00");

    const { dropped_off, unpaid } = await closeOf();

    expect(dropped_off.order_list[0]?.is_cancelled).toBe(false);
    expect(unpaid).toEqual({ amount: 100_000, orders: 1 });
  });

  it("still calls an Order unpaid when it was paid only the next day", async () => {
    await place({ discount: "20000", paidAt: "2026-10-01T09:00" });
    await place();
    // Created on another day: not this day's to chase.
    await place({ createdAt: "2026-09-29T10:00" });
    await place({ createdAt: "2026-09-29T10:00", paidAt: `${DAY}T09:00` });

    expect((await closeOf()).unpaid).toEqual({ amount: 180_000, orders: 2 });
  });
});

describe("what was picked up", () => {
  it("counts each Order once and each Item handed back once", async () => {
    const order = await place({ items: 3, paidAt: `${DAY}T09:00` });
    const pickup = (at: string) =>
      testDb
        .insert(orderPickupEventsTable)
        .values({
          image_path: "pickups/a.jpg",
          order_id: order.orderId,
          picked_up_at: jkt(at),
          picked_up_by: shop.admin.id,
        })
        .returning();
    const [first] = await pickup(`${DAY}T14:00`);
    const [second] = await pickup(`${DAY}T16:00`);
    const [yesterday] = await pickup("2026-09-29T16:00");
    // A second treatment on the first Item must not count the Item twice.
    await testDb.insert(ordersServicesTable).values({
      item_id: order.itemIds[0],
      order_id: order.orderId,
      pickup_event_id: first.id,
      price: "0",
      service_id: shop.serviceId,
      status: "picked_up",
    });
    for (const [index, eventId] of [
      first.id,
      second.id,
      yesterday.id,
    ].entries()) {
      await testDb
        .update(ordersServicesTable)
        .set({ pickup_event_id: eventId, status: "picked_up" })
        .where(eq(ordersServicesTable.id, order.lineIds[index]));
    }
    await place({ store: bintaro });

    expect((await closeOf()).picked_up).toEqual({ items: 2, orders: 1 });
  });
});
