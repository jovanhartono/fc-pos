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
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// What the Counter shows at Kemang: the waiting work against the recent pace,
// the pickup shelf, and what needs a look.

// Loaded after the swap above, never beside the imports (see the Workers suite).
const { createOrder } = await import("@/modules/orders/order.service");
const { getCounter } = await import("@/modules/counter/counter.service");

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

const reachQc = (line: Line, at: Date) =>
  logChange(line, { at, from: "processing", to: "quality_check" });

// `count` lines cleared at Kemang, each first checked at the given shop time.
const clearedAt = async (
  at: string,
  count: number,
  serviceId = shop.serviceId
) => {
  const lines = await placeLines(shop.store, count, serviceId);
  await setStatus(lines, "ready_for_pickup");
  for (const line of lines) {
    await reachQc(line, jkt(at));
  }
};

const clearedOn = (day: string, count: number, serviceId = shop.serviceId) =>
  clearedAt(`${day}T10:00`, count, serviceId);

// Open every day from 23 to 29 September, clearing `perDay` a day.
const steadyWeek = async (perDay: number, serviceId = shop.serviceId) => {
  for (const day of [23, 24, 25, 26, 27, 28, 29]) {
    await clearedOn(`2026-09-${day}`, perDay, serviceId);
  }
};

const waiting = async (count: number, serviceId = shop.serviceId) =>
  setStatus(await placeLines(shop.store, count, serviceId), "queued");

// A line the workshop took from the queue on a later day than its Order.
const startedFor = async (createdAt: Date, isPriority = false) => {
  const [line] = await placeLines(shop.store, 1, shop.serviceId, createdAt);
  await testDb
    .update(ordersServicesTable)
    .set({ is_priority: isPriority, status: "processing" })
    .where(eq(ordersServicesTable.id, line.lineId));
  await logChange(line, {
    at: jkt("2026-09-28T09:00"),
    from: "queued",
    to: "processing",
  });
};

// A line of the given Service, taken from the queue at a time of the test's choosing.
const startedAt = async (serviceId: number, createdAt: Date, at: Date) => {
  const [line] = await placeLines(shop.store, 1, serviceId, createdAt);
  await setStatus([line], "processing");
  await logChange(line, { at, from: "queued", to: "processing" });
};

const OLD_ORDER = jkt("2026-09-10T09:00");
const NEWER_ORDER = jkt("2026-09-20T09:00");

const counterOf = async (storeId = shop.store.id) => getCounter(storeId, NOW);

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

  it("quotes from exactly 14 days after the first Order, not a minute sooner", async () => {
    await steadyWeek(3);
    await waiting(3);
    const firstOrderAt = (at: string) =>
      testDb
        .update(ordersTable)
        .set({ created_at: jkt(at) })
        .where(eq(ordersTable.store_id, shop.store.id));

    await firstOrderAt("2026-09-16T12:01");
    expect((await categoryRow("Footwear"))?.estimate).toBeNull();

    await firstOrderAt("2026-09-16T12:00");
    expect((await categoryRow("Footwear"))?.estimate).not.toBeNull();
  });

  it("needs 7 open days within the last 28", async () => {
    // 1 September is 29 days before the 30th, so it does not count.
    await clearedOn("2026-09-01", 3);
    for (const day of [24, 25, 26, 27, 28, 29]) {
      await clearedOn(`2026-09-${day}`, 3);
    }
    await waiting(3);
    expect((await categoryRow("Footwear"))?.estimate).toBeNull();

    await clearedOn("2026-09-02", 3);
    expect((await categoryRow("Footwear"))?.estimate).not.toBeNull();
  });
});

describe("the workshop rows", () => {
  it("counts Items once, and not at quality check", async () => {
    await steadyWeek(1);
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
    await setStatus([atQc], "quality_check");
    await setStatus([done], "ready_for_pickup");

    expect(await categoryRow("Footwear")).toMatchObject({
      after_clean: false,
      estimate: { days_high: 5, days_low: 4 },
      in_progress: 2,
      items_waiting: 3,
      queued: 1,
    });
  });

  it("totals each Item once across Categories, in progress before queued", async () => {
    const [[bothQueued, repaintQueued], [cleaning, repaintWaiting]] =
      await placeOrder(shop.store, [
        { serviceIds: [shop.serviceId, repaintServiceId] },
        { serviceIds: [shop.serviceId, repaintServiceId] },
      ]);
    await setStatus([bothQueued, repaintQueued, repaintWaiting], "queued");
    await setStatus([cleaning], "processing");

    expect((await counterOf()).workshop).toEqual({ in_progress: 1, queued: 1 });
  });

  it("lists only Categories with something waiting, flagged when they start after cleaning", async () => {
    await steadyWeek(1);
    await waiting(1, repaintServiceId);

    const { categories } = await counterOf();

    expect(categories.map((row) => row.name)).toEqual(["Repaint"]);
    expect(categories[0].after_clean).toBe(true);
  });

  it("ignores another Store's lines", async () => {
    await steadyWeek(1);
    await waiting(2);
    await setStatus(await placeLines(bintaro, 10), "queued");

    expect((await categoryRow("Footwear"))?.items_waiting).toBe(2);
  });

  it("puts the Category with the most Items waiting first", async () => {
    await steadyWeek(1);
    await waiting(1);
    await waiting(3, repaintServiceId);

    expect((await counterOf()).categories.map((row) => row.name)).toEqual([
      "Repaint",
      "Footwear",
    ]);
  });
});

describe("the pace", () => {
  it("skips a closed day instead of counting it as zero", async () => {
    // 28 September: shut, nothing checked.
    for (const day of [22, 23, 24, 25, 26, 27, 29]) {
      await clearedOn(`2026-09-${day}`, 4);
    }
    await waiting(24);

    // 4 a day over the open days is 6 days; counting the shut day says 7.
    expect((await categoryRow("Footwear"))?.estimate?.days_low).toBe(6);
  });

  it("counts yesterday and leaves today's part-day out", async () => {
    await steadyWeek(4);
    await clearedOn("2026-09-30", 40);
    await waiting(8);

    expect((await categoryRow("Footwear"))?.estimate?.days_low).toBe(2);
  });

  it("uses only the 7 most recent open days", async () => {
    await steadyWeek(2);
    // An older, busier day must not lift the pace.
    await clearedOn("2026-09-20", 30);
    await waiting(10);

    expect((await categoryRow("Footwear"))?.estimate?.days_low).toBe(5);
  });

  it("files an early-morning check under its Jakarta day", async () => {
    // 06:00 on the 29th in Jakarta is still the 28th in UTC.
    for (const day of [23, 24, 25, 26, 27, 28]) {
      await clearedOn(`2026-09-${day}`, 3);
    }
    await clearedAt("2026-09-29T06:00", 3);
    await waiting(9);

    expect((await categoryRow("Footwear"))?.estimate?.days_low).toBe(3);
  });

  it("looks further back for a slow Category until it has 7 checks", async () => {
    // Footwear keeps the Store open on every day from the 17th.
    for (const day of [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]) {
      await clearedOn(`2026-09-${day}`, 1);
    }
    // Repaint is checked every other day: 7 checks take 13 open days.
    for (const day of [29, 27, 25, 23, 21, 19, 17]) {
      await clearedOn(`2026-09-${day}`, 1, repaintServiceId);
    }
    await waiting(7, repaintServiceId);

    // 7 checks over 13 open days is 7/13 a day: 7 waiting is 13 days.
    expect((await categoryRow("Repaint"))?.estimate).toEqual({
      days_high: 14,
      days_low: 13,
    });
  });

  it("gives a Category no quote when 4 weeks hold fewer than 7 checks", async () => {
    await steadyWeek(2);
    for (const day of [29, 25, 21, 17, 13, 10]) {
      await clearedOn(`2026-09-${day}`, 1, repaintServiceId);
    }
    await waiting(3);
    await waiting(3, repaintServiceId);

    expect((await categoryRow("Repaint"))?.estimate).toBeNull();
    expect((await categoryRow("Footwear"))?.estimate).not.toBeNull();
  });

  it("counts a line sent back and checked again once", async () => {
    for (const day of [23, 24, 25, 26, 27, 28]) {
      await clearedOn(`2026-09-${day}`, 1);
    }
    const [line] = await placeLines(shop.store, 1);
    await setStatus([line], "ready_for_pickup");
    await reachQc(line, jkt("2026-09-29T10:00"));
    await logChange(line, {
      at: jkt("2026-09-29T11:00"),
      from: "quality_check",
      to: "qc_reject",
    });
    await reachQc(line, jkt("2026-09-29T14:00"));
    await waiting(5);

    expect((await categoryRow("Footwear"))?.estimate?.days_low).toBe(5);
  });

  it("quotes 6.2 days as 6 to 7", async () => {
    await steadyWeek(5);
    await waiting(31);

    expect((await categoryRow("Footwear"))?.estimate).toEqual({
      days_high: 7,
      days_low: 6,
    });
  });

  it("quotes 0.4 days as 1 to 2", async () => {
    await steadyWeek(5);
    await waiting(2);

    expect((await categoryRow("Footwear"))?.estimate).toEqual({
      days_high: 2,
      days_low: 1,
    });
  });
});

describe("Stuck Items", () => {
  // Footwear clears 1 a day, so a Footwear line passed over by 2 newer ones
  // has waited more than a day's work.
  beforeEach(() => steadyWeek(1));

  it("flags a queued line that 2 newer lines in its Category overtook", async () => {
    const [line] = await placeLines(shop.store, 1, shop.serviceId, OLD_ORDER);
    await setStatus([line], "queued");
    await startedFor(NEWER_ORDER);
    await startedFor(NEWER_ORDER);

    expect((await counterOf()).stuck).toEqual([
      {
        category: "Footwear",
        item_code: expect.any(String),
        newer_started: 2,
        order_id: line.orderId,
        order_service_id: line.lineId,
        waiting_days: 20,
      },
    ]);
  });

  it("does not flag a line when only as many went first as the Category does in a day", async () => {
    const [line] = await placeLines(shop.store, 1, shop.serviceId, OLD_ORDER);
    await setStatus([line], "queued");
    await startedFor(NEWER_ORDER);

    expect((await counterOf()).stuck).toEqual([]);
  });

  it("leaves out Priority lines, on either side", async () => {
    const [waitingLine, priorityLine] = await placeLines(
      shop.store,
      2,
      shop.serviceId,
      OLD_ORDER
    );
    await setStatus([waitingLine, priorityLine], "queued");
    await testDb
      .update(ordersServicesTable)
      .set({ is_priority: true })
      .where(eq(ordersServicesTable.id, priorityLine.lineId));
    // Priority jumps the queue by design, so these overtook nobody.
    await startedFor(NEWER_ORDER, true);
    await startedFor(NEWER_ORDER, true);
    await startedFor(NEWER_ORDER);

    expect((await counterOf()).stuck).toEqual([]);

    await startedFor(NEWER_ORDER);

    expect(
      (await counterOf()).stuck.map((item) => item.order_service_id)
    ).toEqual([waitingLine.lineId]);
  });

  it("does not count lines from an older Order as newer", async () => {
    const [line] = await placeLines(shop.store, 1, shop.serviceId, NEWER_ORDER);
    await setStatus([line], "queued");
    await startedFor(OLD_ORDER);
    await startedFor(OLD_ORDER);

    expect((await counterOf()).stuck).toEqual([]);
  });

  it("only counts Repaints started after its Item's clean was done", async () => {
    for (const day of [23, 24, 25, 26, 27, 28, 29]) {
      await clearedOn(`2026-09-${day}`, 1, repaintServiceId);
    }
    const [[clean, repaint]] = await placeOrder(
      shop.store,
      [{ serviceIds: [shop.serviceId, repaintServiceId] }],
      OLD_ORDER
    );
    await setStatus([clean], "ready_for_pickup");
    await setStatus([repaint], "queued");
    await reachQc(clean, jkt("2026-09-29T10:00"));
    // Started while this Repaint was still waiting for its clean.
    await startedAt(repaintServiceId, NEWER_ORDER, jkt("2026-09-28T09:00"));
    await startedAt(repaintServiceId, NEWER_ORDER, jkt("2026-09-28T09:00"));

    expect((await counterOf()).stuck).toEqual([]);

    await startedAt(repaintServiceId, NEWER_ORDER, jkt("2026-09-29T15:00"));
    await startedAt(repaintServiceId, NEWER_ORDER, jkt("2026-09-29T15:00"));

    expect(
      (await counterOf()).stuck.map((item) => item.order_service_id)
    ).toEqual([repaint.lineId]);
  });

  it("keeps a Repaint waiting for its Item's clean out, but flags a Repaint-only Item", async () => {
    for (const day of [23, 24, 25, 26, 27, 28, 29]) {
      await clearedOn(`2026-09-${day}`, 1, repaintServiceId);
    }
    const [[, cleanAndRepaint], [repaintOnly]] = await placeOrder(
      shop.store,
      [
        { serviceIds: [shop.serviceId, repaintServiceId] },
        { serviceIds: [repaintServiceId] },
      ],
      OLD_ORDER
    );
    await setStatus([cleanAndRepaint, repaintOnly], "queued");
    for (let index = 0; index < 2; index++) {
      const [line] = await placeLines(
        shop.store,
        1,
        repaintServiceId,
        NEWER_ORDER
      );
      await setStatus([line], "processing");
      await logChange(line, {
        at: jkt("2026-09-28T09:00"),
        from: "queued",
        to: "processing",
      });
    }

    const stuck = (await counterOf()).stuck.map(
      (item) => item.order_service_id
    );

    expect(stuck).toEqual([repaintOnly.lineId]);
  });

  it("flags nothing in a Category with no quote", async () => {
    const [line] = await placeLines(shop.store, 1, repaintServiceId, OLD_ORDER);
    await setStatus([line], "queued");
    await startedFor(NEWER_ORDER);

    expect((await counterOf()).stuck).toEqual([]);
  });

  it("lists the longest waiting first", async () => {
    const [younger] = await placeLines(
      shop.store,
      1,
      shop.serviceId,
      jkt("2026-09-12T09:00")
    );
    const [older] = await placeLines(shop.store, 1, shop.serviceId, OLD_ORDER);
    await setStatus([younger, older], "queued");
    await startedFor(NEWER_ORDER);
    await startedFor(NEWER_ORDER);

    expect(
      (await counterOf()).stuck.map((item) => item.order_service_id)
    ).toEqual([older.lineId, younger.lineId]);
  });
});

describe("QC rejects waiting", () => {
  it("carries the latest reject note and how long ago it was", async () => {
    const [line] = await placeLines(shop.store, 1);
    await setStatus([line], "qc_reject");
    await logChange(line, {
      at: jkt("2026-09-25T10:00"),
      from: "quality_check",
      note: "Sole still yellow",
      to: "qc_reject",
    });
    await logChange(line, {
      at: jkt("2026-09-27T10:00"),
      from: "quality_check",
      note: "Lace stain remains",
      to: "qc_reject",
    });
    const [noNote] = await placeLines(shop.store, 1);
    await setStatus([noNote], "qc_reject");
    await logChange(noNote, {
      at: jkt("2026-09-29T10:00"),
      from: "quality_check",
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
    await steadyWeek(1);

    const [waitingLine, reject, complained, onShelf] = await placeLines(
      shop.store,
      4,
      shop.serviceId,
      lastNight
    );
    await setStatus([waitingLine], "queued");
    await setStatus([reject], "qc_reject");
    await setStatus([complained, onShelf], "ready_for_pickup");
    await logChange(reject, {
      at: lastNight,
      from: "quality_check",
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
    // Two lines that joined the queue after it went first.
    await startedAt(
      shop.serviceId,
      jkt("2026-09-29T21:00"),
      jkt("2026-09-29T22:00")
    );
    await startedAt(
      shop.serviceId,
      jkt("2026-09-29T21:00"),
      jkt("2026-09-29T22:00")
    );

    const counter = await counterOf();

    expect(counter.stuck.map((item) => item.waiting_days)).toEqual([1]);
    expect(counter.qc_rejects.map((item) => item.days)).toEqual([1]);
    expect(counter.complaints.map((item) => item.days)).toEqual([1]);
    expect(
      counter.pickup_shelf.oldest.map((order) => order.ready_days)
    ).toEqual([1]);
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

  it("shows the Orders waiting longest first, as whole days, at most 10", async () => {
    for (let day = 1; day <= 12; day++) {
      await putOnShelf(
        shop.store,
        1,
        jkt(`2026-09-${String(day).padStart(2, "0")}T10:00`)
      );
    }

    const { pickup_shelf } = await counterOf();

    expect(pickup_shelf.orders).toBe(12);
    expect(pickup_shelf.oldest).toHaveLength(10);
    expect(pickup_shelf.oldest.map((order) => order.ready_days)).toEqual([
      29, 28, 27, 26, 25, 24, 23, 22, 21, 20,
    ]);
    expect(pickup_shelf.oldest[0]).toMatchObject({
      customer_name: "Budi Santoso",
      customer_phone: "+628111222333",
      items: 1,
    });
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
    expect(pickup_shelf.oldest[0].items).toBe(2);
  });

  it("says 0 days for an Order that became ready today", async () => {
    await putOnShelf(shop.store, 2, jkt("2026-09-30T09:00"));

    expect((await counterOf()).pickup_shelf.oldest[0]).toMatchObject({
      items: 2,
      ready_days: 0,
    });
  });
});
