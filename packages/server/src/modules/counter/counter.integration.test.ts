import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import {
  categoriesTable,
  complaintsTable,
  orderPickupEventsTable,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
} from "@/db/schema";
import { DAY_MS } from "@/modules/reports/report-range.util";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// What the Counter shows at Kemang: the waiting work against how long recent
// Items took, the pickup shelf, and what needs a look.

// Loaded after the swap above, never beside the imports (see the Workers suite).
const { createOrder } = await import("@/modules/orders/order.service");
const { getCounter, getPickupShelf } = await import(
  "@/modules/counter/counter.service"
);

const jkt = (local: string) => new Date(`${local}:00+07:00`);

// A Wednesday noon; "today" is 30 September.
const NOW = jkt("2026-09-30T12:00");
const LONG_AGO = jkt("2026-08-01T09:00");

type Store = Shop["store"];
type Status = (typeof ordersServicesTable.$inferInsert)["status"];

interface Line {
  itemId: number;
  lineId: number;
  orderId: number;
}

let shop: Shop;
let bintaro: Store;
let repaintServiceId: number;

const placeOrder = async (
  store: Store,
  items: { serviceIds: number[] }[],
  createdAt = LONG_AGO
): Promise<Line[][]> => {
  const order = await createOrder(shop.admin.id, store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    items: items.map(({ serviceIds }, index) => ({
      brand: `item-${index}`,
      services: serviceIds.map((id) => ({ id })),
    })),
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid",
    store_id: store.id,
    voucher_codes: [],
  });
  // Placed in real time; the Counter reads how long the Store has been trading.
  await testDb
    .update(ordersTable)
    .set({ created_at: createdAt })
    .where(eq(ordersTable.id, order.id));

  const placed = await testDb.query.itemsTable.findMany({
    where: { order_id: order.id },
    with: { services: true },
    orderBy: { id: "asc" },
  });
  return placed.map((item) =>
    item.services.map((line) => ({
      itemId: item.id,
      lineId: line.id,
      orderId: order.id,
    }))
  );
};

// One Item with one Service each.
const placeLines = async (
  store: Store,
  count: number,
  serviceId = shop.serviceId,
  createdAt = LONG_AGO
): Promise<Line[]> => {
  const items = await placeOrder(
    store,
    Array.from({ length: count }, () => ({ serviceIds: [serviceId] })),
    createdAt
  );
  return items.flat();
};

const setStatus = (lines: Line[], status: Status) =>
  testDb
    .update(ordersServicesTable)
    .set({ status })
    .where(
      inArray(
        ordersServicesTable.id,
        lines.map((line) => line.lineId)
      )
    );

const logChange = (
  line: Line,
  change: {
    at: Date;
    from: Status | null;
    note?: string;
    to: NonNullable<Status>;
  }
) =>
  testDb.insert(orderServiceStatusLogsTable).values({
    changed_by: shop.admin.id,
    created_at: change.at,
    from_status: change.from,
    note: change.note,
    order_service_id: line.lineId,
    to_status: change.to,
  });

const readyLog = (line: Line, at: Date) =>
  logChange(line, { at, from: "waiting_qc", to: "ready_for_pickup" });

// One Item per entry, each ready that many days after its drop-off.
const readyAfter = async (
  days: number[],
  {
    droppedOff = jkt("2026-09-20T10:00"),
    serviceIds = [shop.serviceId],
    store = shop.store,
  } = {}
) => {
  const items = await placeOrder(
    store,
    days.map(() => ({ serviceIds })),
    droppedOff
  );
  for (const [index, lines] of items.entries()) {
    await setStatus(lines, "ready_for_pickup");
    for (const line of lines) {
      await readyLog(
        line,
        new Date(droppedOff.getTime() + days[index] * DAY_MS)
      );
    }
  }
  return items;
};

const tenTimes = (days: number) => Array.from({ length: 10 }, () => days);

const waiting = async (count: number, serviceId = shop.serviceId) =>
  setStatus(await placeLines(shop.store, count, serviceId), "queued");

const counterOf = async (storeId = shop.store.id, now = NOW) =>
  getCounter(storeId, now);

const shelfOf = async (page: { offset?: number } = {}) =>
  getPickupShelf({ store_id: shop.store.id, ...page }, NOW);

const categoryRow = async (name: string) =>
  (await counterOf()).categories.find((row) => row.name === name);

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

  const [repaint] = await testDb
    .insert(categoriesTable)
    .values({ is_active: true, name: "Repaint", starts_after_cleaning: true })
    .returning();
  const [repaintService] = await testDb
    .insert(servicesTable)
    .values({
      category_id: repaint.id,
      code: "RPT",
      cogs: "0",
      is_active: true,
      name: "Repaint Sole",
      price: "150000",
    })
    .returning();
  repaintServiceId = repaintService.id;
});

describe("when there is nothing honest to quote", () => {
  it("lists no Categories for a Store with no Orders", async () => {
    expect((await counterOf()).categories).toEqual([]);
  });

  it("needs 10 Items ready in the last 4 weeks", async () => {
    await waiting(1);
    await readyAfter([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Ready on 1 September, 29 days back: too old to count.
    await readyAfter([3], { droppedOff: jkt("2026-08-29T10:00") });
    expect((await categoryRow("Footwear"))?.estimate).toBeNull();

    await readyAfter([3]);
    expect((await categoryRow("Footwear"))?.estimate).not.toBeNull();
  });

  it("ignores another Store's Items", async () => {
    await waiting(1);
    await readyAfter(tenTimes(2), { store: bintaro });

    expect((await categoryRow("Footwear"))?.estimate).toBeNull();
  });
});

describe("the workshop rows", () => {
  it("counts Items once, with Waiting QC as its own stage", async () => {
    // One Item with two Services is two lines but one Item.
    const [[cleanLine, repairLine], [processing], [rejected], [atQc], [done]] =
      await placeOrder(shop.store, [
        { serviceIds: [shop.serviceId, shop.repairServiceId] },
        { serviceIds: [shop.serviceId] },
        { serviceIds: [shop.serviceId] },
        { serviceIds: [shop.serviceId] },
        { serviceIds: [shop.serviceId] },
      ]);
    await setStatus([cleanLine, repairLine], "queued");
    await setStatus([processing], "processing");
    await setStatus([rejected], "qc_reject");
    await setStatus([atQc], "waiting_qc");
    await setStatus([done], "ready_for_pickup");

    expect(await categoryRow("Footwear")).toMatchObject({
      estimate: null,
      in_progress: 2,
      items_waiting: 4,
      queued: 1,
      waiting_qc: 1,
    });
  });

  it("totals each Item once across Categories: in progress, then Waiting QC, then queued", async () => {
    const [
      [bothQueued, repaintQueued],
      [cleaning, repaintWaiting],
      [cleaned, repaintNext],
      [cleanChecked, repaintChecked],
    ] = await placeOrder(shop.store, [
      { serviceIds: [shop.serviceId, repaintServiceId] },
      { serviceIds: [shop.serviceId, repaintServiceId] },
      { serviceIds: [shop.serviceId, repaintServiceId] },
      { serviceIds: [shop.serviceId, repaintServiceId] },
    ]);
    await setStatus(
      [bothQueued, repaintQueued, repaintWaiting, repaintNext],
      "queued"
    );
    await setStatus([cleaning], "processing");
    // Cleaned and on the shelf, but its Repaint is still to do.
    await setStatus([cleaned, cleanChecked, repaintChecked], "waiting_qc");

    expect((await counterOf()).workshop).toEqual({
      in_progress: 2,
      queued: 1,
      waiting_qc: 1,
    });
  });

  it("lists only Categories with something waiting, flagged when they start after cleaning", async () => {
    await waiting(1, repaintServiceId);

    const { categories } = await counterOf();

    expect(categories.map((row) => row.name)).toEqual(["Repaint"]);
    expect(categories[0].after_clean).toBe(true);
  });

  it("ignores another Store's lines", async () => {
    await waiting(2);
    await setStatus(await placeLines(bintaro, 10), "queued");

    expect((await categoryRow("Footwear"))?.items_waiting).toBe(2);
  });

  it("puts the Category with the most Items waiting first", async () => {
    await waiting(1);
    await waiting(3, repaintServiceId);

    expect((await counterOf()).categories.map((row) => row.name)).toEqual([
      "Repaint",
      "Footwear",
    ]);
  });
});

describe("the Ready estimate", () => {
  it("quotes the p90 by nearest rank, rounded up to whole days", async () => {
    await waiting(1);
    // The 9th of 10 is 8.5 days: the cashier says 9.
    await readyAfter([1, 2, 3, 4, 5, 6, 7, 8, 8.5, 10], {
      droppedOff: jkt("2026-09-18T10:00"),
    });

    expect((await categoryRow("Footwear"))?.estimate).toEqual({
      days: 9,
      ready_on: "2026-10-09",
    });
  });

  it("never quotes less than 1 day", async () => {
    await waiting(1);
    await readyAfter(tenTimes(0.1));

    expect((await categoryRow("Footwear"))?.estimate?.days).toBe(1);
  });

  it("uses the last 14 days once they hold 10 Items", async () => {
    await waiting(1);
    await readyAfter(tenTimes(2));
    // Slow ones from three weeks back no longer count.
    await readyAfter([15, 15, 15, 15, 15], {
      droppedOff: jkt("2026-08-25T10:00"),
    });

    expect((await categoryRow("Footwear"))?.estimate?.days).toBe(2);
  });

  it("looks back 28 days when 14 hold fewer than 10", async () => {
    await waiting(1);
    await readyAfter([2, 2, 2, 2, 2]);
    // Ready on 4 September: inside 28 days, outside 14.
    await readyAfter([15, 15, 15, 15, 15], {
      droppedOff: jkt("2026-08-20T10:00"),
    });

    expect((await categoryRow("Footwear"))?.estimate?.days).toBe(15);
  });

  it("counts an Item with a clean and a Repaint under both, with nothing added after the clean", async () => {
    await waiting(1);
    await waiting(1, repaintServiceId);
    await readyAfter(tenTimes(3), {
      serviceIds: [shop.serviceId, repaintServiceId],
    });

    expect((await categoryRow("Footwear"))?.estimate?.days).toBe(3);
    expect((await categoryRow("Repaint"))?.estimate?.days).toBe(3);
  });

  it("leaves Rework lines out of an Item's time", async () => {
    await waiting(1);
    const items = await readyAfter(tenTimes(2));
    const [first] = items[0];
    const [complaint] = await testDb
      .insert(complaintsTable)
      .values({
        opened_by: shop.admin.id,
        order_service_id: first.lineId,
        reason: "Stain",
      })
      .returning();
    const [rework] = await testDb
      .insert(ordersServicesTable)
      .values({
        complaint_id: complaint.id,
        item_id: first.itemId,
        order_id: first.orderId,
        price: "0",
        service_id: shop.serviceId,
        status: "ready_for_pickup",
      })
      .returning();
    // Counted, the Rework would make this Item 9 days and the p90 9.
    await readyLog({ ...first, lineId: rework.id }, jkt("2026-09-29T10:00"));

    expect((await categoryRow("Footwear"))?.estimate?.days).toBe(2);
  });

  it("dates the quote from today in Jakarta, not in UTC", async () => {
    await waiting(1);
    await readyAfter(tenTimes(2));

    // 06:00 on 1 October in Jakarta is still 30 September in UTC.
    const early = await counterOf(shop.store.id, jkt("2026-10-01T06:00"));

    expect(early.categories[0].estimate).toEqual({
      days: 2,
      ready_on: "2026-10-03",
    });
  });
});

describe("QC rejects waiting", () => {
  it("carries the latest reject note and how long ago it was", async () => {
    const [line] = await placeLines(shop.store, 1);
    await setStatus([line], "qc_reject");
    await logChange(line, {
      at: jkt("2026-09-25T10:00"),
      from: "waiting_qc",
      note: "Sole still yellow",
      to: "qc_reject",
    });
    await logChange(line, {
      at: jkt("2026-09-27T10:00"),
      from: "waiting_qc",
      note: "Lace stain remains",
      to: "qc_reject",
    });
    const [noNote] = await placeLines(shop.store, 1);
    await setStatus([noNote], "qc_reject");
    await logChange(noNote, {
      at: jkt("2026-09-29T10:00"),
      from: "waiting_qc",
      to: "qc_reject",
    });

    expect((await counterOf()).qc_rejects).toEqual([
      {
        category: "Footwear",
        days: 3,
        item_code: expect.any(String),
        note: "Lace stain remains",
        order_id: line.orderId,
        order_service_id: line.lineId,
      },
      {
        category: "Footwear",
        days: 1,
        item_code: expect.any(String),
        note: null,
        order_id: noNote.orderId,
        order_service_id: noNote.lineId,
      },
    ]);
  });
});

describe("Complaints not decided", () => {
  const complain = async (line: Line, reason: string, at: Date) => {
    const [complaint] = await testDb
      .insert(complaintsTable)
      .values({
        created_at: at,
        opened_by: shop.admin.id,
        order_service_id: line.lineId,
        reason,
      })
      .returning();
    return complaint;
  };

  const reworkOf = async (complaintId: number, line: Line, status: Status) =>
    testDb.insert(ordersServicesTable).values({
      complaint_id: complaintId,
      item_id: line.itemId,
      order_id: line.orderId,
      price: "0",
      service_id: shop.serviceId,
      status,
    });

  it("lists a Complaint with no Rework, and not one that has a Rework round", async () => {
    const [undecided, reworked, cancelledRework, refunded] = await placeLines(
      shop.store,
      4
    );
    await setStatus([undecided, reworked, cancelledRework], "ready_for_pickup");
    await setStatus([refunded], "refunded");
    const open = await complain(
      undecided,
      "Still dirty",
      jkt("2026-09-27T10:00")
    );
    const withRework = await complain(
      reworked,
      "Stain",
      jkt("2026-09-27T10:00")
    );
    const withCancelled = await complain(
      cancelledRework,
      "Smell",
      jkt("2026-09-28T10:00")
    );
    await complain(refunded, "Damaged", jkt("2026-09-28T10:00"));
    await reworkOf(withRework.id, reworked, "queued");
    await reworkOf(withCancelled.id, cancelledRework, "cancelled");

    expect((await counterOf()).complaints).toEqual([
      {
        category: "Footwear",
        complaint_id: open.id,
        days: 3,
        item_code: expect.any(String),
        reason: "Still dirty",
      },
      {
        category: "Footwear",
        complaint_id: withCancelled.id,
        days: 2,
        item_code: expect.any(String),
        reason: "Smell",
      },
    ]);
  });

  it("leaves out another Store's Complaints", async () => {
    const [line] = await placeLines(bintaro, 1);
    await setStatus([line], "ready_for_pickup");
    await complain(line, "Still dirty", jkt("2026-09-27T10:00"));

    expect((await counterOf()).complaints).toEqual([]);
  });
});

describe("days are Jakarta calendar days", () => {
  // 20:00 last night is only 16 hours before the noon NOW, but yesterday.
  const lastNight = jkt("2026-09-29T20:00");

  it("says 1 day for something from last evening in every list", async () => {
    const [reject, complained, onShelf] = await placeLines(
      shop.store,
      3,
      shop.serviceId,
      lastNight
    );
    await setStatus([reject], "qc_reject");
    await setStatus([complained, onShelf], "ready_for_pickup");
    await logChange(reject, {
      at: lastNight,
      from: "waiting_qc",
      to: "qc_reject",
    });
    await testDb.insert(complaintsTable).values({
      created_at: lastNight,
      opened_by: shop.admin.id,
      order_service_id: complained.lineId,
      reason: "Stain",
    });
    await testDb
      .update(ordersTable)
      .set({ ready_at: lastNight, status: "ready_for_pickup" })
      .where(eq(ordersTable.id, onShelf.orderId));

    const counter = await counterOf();

    expect(counter.qc_rejects.map((item) => item.days)).toEqual([1]);
    expect(counter.complaints.map((item) => item.days)).toEqual([1]);
    expect((await shelfOf()).items.map((order) => order.ready_days)).toEqual([
      1,
    ]);
  });
});

describe("the pickup shelf", () => {
  const putOnShelf = async (store: Store, itemCount: number, readyAt: Date) => {
    const lines = await placeLines(store, itemCount);
    await setStatus(lines, "ready_for_pickup");
    await testDb
      .update(ordersTable)
      .set({ ready_at: readyAt, status: "ready_for_pickup" })
      .where(eq(ordersTable.id, lines[0].orderId));
    return lines;
  };

  // placeLines puts every Item on one Order.
  it("counts Orders and Items, leaves out cancelled lines and other Stores", async () => {
    const [, cancelled] = await putOnShelf(
      shop.store,
      3,
      jkt("2026-09-25T10:00")
    );
    await setStatus([cancelled], "cancelled");
    await putOnShelf(shop.store, 1, jkt("2026-09-29T10:00"));
    await putOnShelf(bintaro, 5, jkt("2026-09-20T10:00"));

    const { pickup_shelf } = await counterOf();

    expect(pickup_shelf.orders).toBe(2);
    expect(pickup_shelf.items).toBe(3);
  });

  const shelfOfTwelve = async () => {
    for (let day = 1; day <= 12; day++) {
      await putOnShelf(
        shop.store,
        1,
        jkt(`2026-09-${String(day).padStart(2, "0")}T10:00`)
      );
    }
  };

  it("lists the Orders waiting longest first, as whole days", async () => {
    await shelfOfTwelve();
    await putOnShelf(bintaro, 1, jkt("2026-08-20T10:00"));

    const shelf = await shelfOf();

    expect((await counterOf()).pickup_shelf.orders).toBe(12);
    expect(shelf.meta).toEqual({ limit: 20, offset: 0, total: 12 });
    expect(shelf.items.map((order) => order.ready_days)).toEqual([
      29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18,
    ]);
    expect(shelf.items[0]).toMatchObject({
      customer_name: "Budi Santoso",
      customer_phone: "+628111222333",
      items: 1,
      notified: false,
    });
  });

  it("hands out the shelf a page at a time", async () => {
    await shelfOfTwelve();

    const last = await shelfOf({ offset: 10 });

    expect(last.items.map((order) => order.ready_days)).toEqual([19, 18]);
    expect(last.meta).toEqual({ limit: 20, offset: 10, total: 12 });
  });

  it("counts only the Items still on the shelf, not one already picked up", async () => {
    const [pickedUp] = await putOnShelf(shop.store, 3, jkt("2026-09-29T10:00"));
    // A part pickup: the Customer took this one home, the rest still wait.
    const [pickup] = await testDb
      .insert(orderPickupEventsTable)
      .values({
        image_path: "pickups/part.jpg",
        order_id: pickedUp.orderId,
        picked_up_by: shop.admin.id,
      })
      .returning();
    await testDb
      .update(ordersServicesTable)
      .set({ pickup_event_id: pickup.id, status: "picked_up" })
      .where(eq(ordersServicesTable.id, pickedUp.lineId));

    const { pickup_shelf } = await counterOf();

    expect(pickup_shelf.orders).toBe(1);
    expect(pickup_shelf.items).toBe(2);
    expect((await shelfOf()).items[0].items).toBe(2);
  });

  it("says 0 days for an Order that became ready today", async () => {
    await putOnShelf(shop.store, 2, jkt("2026-09-30T09:00"));

    expect((await shelfOf()).items[0]).toMatchObject({
      items: 2,
      ready_days: 0,
    });
  });
});
