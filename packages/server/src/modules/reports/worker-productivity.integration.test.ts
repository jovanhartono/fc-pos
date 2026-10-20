import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import {
  complaintsTable,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  shiftsTable,
  storesTable,
  usersTable,
} from "@/db/schema";
import {
  getJakartaDayRange,
  shiftDate,
} from "@/modules/reports/report-range.util";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";
import { jakartaNow } from "@/utils/date";

// The Workers tab, told through the status log and the clock-in sheet. Adi,
// Bayu and Citra clean at Kemang; Bayu also covers Bintaro; the admin starts
// the odd pair herself.

// Loaded after the swap above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the shop's real database.
const { createOrder } = await import("@/modules/orders/order.service");
const { getWorkerDetailReport, getWorkerProductivityReport } = await import(
  "@/modules/reports/report-range.service"
);
const { NotFoundException } = await import("@/http-exceptions");

const AUGUST = { from: "2026-08-01", to: "2026-08-31" };

// Wall-clock time at the shop.
const jkt = (local: string) => new Date(`${local}:00+07:00`);

type Status = (typeof orderServiceStatusLogsTable.$inferInsert)["to_status"];
type Store = Shop["store"];

interface Line {
  itemId: number;
  lineId: number;
  orderId: number;
}

let shop: Shop;
let bintaro: Store;
let adi: number;
let bayu: number;
let citra: number;

const placeOrder = async (
  store: Store,
  items: { brand: string; serviceId: number }[]
): Promise<Record<string, Line>> => {
  const order = await createOrder(shop.admin.id, store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    items: items.map(({ brand, serviceId }) => ({
      brand,
      services: [{ id: serviceId }],
    })),
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid",
    store_id: store.id,
    voucher_codes: [],
  });
  const placed = await testDb.query.itemsTable.findMany({
    where: { order_id: order.id },
    with: { services: true },
  });
  return Object.fromEntries(
    placed.map((item) => [
      item.brand ?? "",
      { itemId: item.id, lineId: item.services[0].id, orderId: item.order_id },
    ])
  );
};

const log = (lineId: number, steps: [Status | null, Status, number, Date][]) =>
  testDb.insert(orderServiceStatusLogsTable).values(
    steps.map(([from, to, by, at]) => ({
      changed_by: by,
      created_at: at,
      from_status: from,
      order_service_id: lineId,
      to_status: to,
    }))
  );

const clockIn = (
  userId: number,
  storeId: number,
  clockInAt: Date,
  clockOutAt: Date | null
) =>
  testDb.insert(shiftsTable).values({
    clock_in_at: clockInAt,
    clock_out_at: clockOutAt,
    store_id: storeId,
    user_id: userId,
  });

const detailOf = (
  userId: number,
  storeId: number,
  range: { from: string; to: string } = AUGUST
) => getWorkerDetailReport({ ...range, store_id: storeId, user_id: userId });

// A person's bars keyed by the day or week they stand for, gaps left out.
const barsOf = async (
  userId: number,
  storeId: number,
  range?: { from: string; to: string }
) => {
  const { buckets } = await detailOf(userId, storeId, range);
  return Object.fromEntries(
    buckets.flatMap(({ label, total }) =>
      total === null ? [] : [[label, total]]
    )
  );
};

const complain = async (line: Line) => {
  const [complaint] = await testDb
    .insert(complaintsTable)
    .values({
      opened_by: shop.cashier.id,
      order_service_id: line.lineId,
      reason: "Still dirty",
    })
    .returning();
  return complaint.id;
};

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();

  [{ id: adi }, { id: bayu }, { id: citra }] = await testDb
    .insert(usersTable)
    .values(
      ["Adi", "Bayu", "Citra"].map((name) => ({
        name,
        password: "hashed",
        role: "worker" as const,
        username: `worker${name.toLowerCase()}`,
      }))
    )
    .returning();

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
});

describe("the Workers report over August", () => {
  beforeEach(async () => {
    const clean = shop.serviceId;
    const repair = shop.repairServiceId;
    const kemang = await placeOrder(shop.store, [
      { brand: "adi-clean", serviceId: clean },
      { brand: "adi-repair", serviceId: repair },
      { brand: "by-admin", serviceId: clean },
      { brand: "never-started", serviceId: clean },
    ]);
    const atBintaro = await placeOrder(bintaro, [
      { brand: "bintaro", serviceId: clean },
    ]);
    const admin = shop.admin.id;

    // Adi cleans, Citra passes it.
    await log(kemang["adi-clean"].lineId, [
      ["queued", "processing", adi, jkt("2026-08-03T09:00")],
      ["processing", "quality_check", adi, jkt("2026-08-03T10:00")],
      ["quality_check", "ready_for_pickup", citra, jkt("2026-08-03T11:00")],
    ]);
    // Adi starts the repair, Citra sends it back, Bayu redoes it and his
    // round passes. The Customer then complains: that is Bayu's round.
    await log(kemang["adi-repair"].lineId, [
      ["queued", "processing", adi, jkt("2026-08-03T12:00")],
      ["processing", "quality_check", adi, jkt("2026-08-03T13:00")],
      ["quality_check", "qc_reject", citra, jkt("2026-08-03T14:00")],
      ["qc_reject", "processing", bayu, jkt("2026-08-03T15:00")],
      ["processing", "quality_check", bayu, jkt("2026-08-03T16:00")],
      ["quality_check", "ready_for_pickup", citra, jkt("2026-08-03T17:00")],
    ]);
    const complaintId = await complain(kemang["adi-repair"]);
    // Bayu does the free redo; it passes and is never anyone's Complaint.
    const [rework] = await testDb
      .insert(ordersServicesTable)
      .values({
        complaint_id: complaintId,
        item_id: kemang["adi-repair"].itemId,
        order_id: kemang["adi-repair"].orderId,
        price: "0",
        service_id: repair,
        status: "ready_for_pickup",
      })
      .returning();
    await log(rework.id, [
      ["queued", "processing", bayu, jkt("2026-08-20T09:00")],
      ["processing", "quality_check", bayu, jkt("2026-08-20T10:00")],
      ["quality_check", "ready_for_pickup", citra, jkt("2026-08-20T11:00")],
    ]);
    // The admin starts a pair herself on a busy morning; nobody has checked
    // it yet.
    await log(kemang["by-admin"].lineId, [
      ["queued", "processing", admin, jkt("2026-08-04T09:00")],
      ["processing", "quality_check", admin, jkt("2026-08-04T10:00")],
    ]);
    // Reached QC with no start on record: the shop's work, nobody's credit.
    await log(kemang["never-started"].lineId, [
      ["processing", "quality_check", adi, jkt("2026-08-05T10:00")],
    ]);
    // Bayu covering Bintaro; Adi passes his work there.
    await log(atBintaro.bintaro.lineId, [
      ["queued", "processing", bayu, jkt("2026-08-06T09:00")],
      ["processing", "quality_check", bayu, jkt("2026-08-06T10:00")],
      ["quality_check", "ready_for_pickup", adi, jkt("2026-08-06T11:00")],
    ]);

    // Adi clocks in twice on 3 August, the first time before 07:00 Jakarta
    // (still 2 August in UTC), and leaves 4 August's Shift open.
    await clockIn(
      adi,
      shop.store.id,
      jkt("2026-08-03T06:30"),
      jkt("2026-08-03T12:00")
    );
    await clockIn(
      adi,
      shop.store.id,
      jkt("2026-08-03T13:00"),
      jkt("2026-08-03T18:00")
    );
    await clockIn(adi, shop.store.id, jkt("2026-08-04T08:00"), null);
    // Adi lent to Bintaro for a day.
    await clockIn(
      adi,
      bintaro.id,
      jkt("2026-07-30T08:00"),
      jkt("2026-07-30T17:00")
    );
    await clockIn(
      adi,
      bintaro.id,
      jkt("2026-08-06T08:00"),
      jkt("2026-08-06T17:00")
    );
    await clockIn(
      bayu,
      shop.store.id,
      jkt("2026-08-20T08:00"),
      jkt("2026-08-20T17:00")
    );
  });

  const kemangAugust = () =>
    getWorkerProductivityReport({ ...AUGUST, store_id: shop.store.id });

  it("lists everyone who started or moved an Item at the bench, admin included, with their role", async () => {
    const report = await kemangAugust();

    // Citra only checked Items, so she has days worked and no Services.
    expect(
      report.workers.map((row) => [row.user_name, row.role, row.store_name])
    ).toEqual([
      ["Adi", "worker", "Fresclean Kemang"],
      ["Ayu Admin", "admin", "Fresclean Kemang"],
      ["Bayu", "worker", "Fresclean Kemang"],
      ["Citra", "worker", "Fresclean Kemang"],
    ]);
    const admin = report.workers.find((row) => row.user_id === shop.admin.id);
    expect(admin).toEqual(
      expect.objectContaining({
        services_processed: 1,
        days_worked: 1,
        per_day_worked: 1,
      })
    );
    // No Shift all month, but the day she started a pair is a day worked.
    expect(await barsOf(shop.admin.id, shop.store.id)).toEqual({
      "2026-08-04": 1,
    });
  });

  it("counts every processed line in the headline, credited or not", async () => {
    const report = await kemangAugust();

    // Adi's two, the admin's one, Bayu's Rework, and the line nobody started.
    expect(report.summary.current).toEqual({
      services_processed: 5,
      // Adi 3 (3, 4 and 5 Aug), the admin 1, Bayu 2, Citra 2.
      days_worked: 8,
      people: 4,
      // Adi's 2, the admin's 1 and Bayu's 1 over those 8 days.
      per_day_worked: 0.5,
      daily_p25: 0,
      daily_p75: 1,
      qc_checks: 4,
      qc_rejects: 1,
      qc_reject_rate: 0.25,
      // Two lines passed QC (Adi's clean and the Repair); the Repair has a
      // Complaint. The Rework and the two never-passed lines are out.
      complaints: 1,
      complaint_cohort: 2,
      complaint_rate: 0.5,
    });
  });

  it("counts days worked per person, Store and Jakarta day, open Shifts and bench moves included", async () => {
    const report = await kemangAugust();
    const row = report.workers.find((r) => r.user_id === adi);

    // 3 August twice and 4 August still open, plus 5 August with no Shift but
    // an Item sent to QC; Bintaro's day is not Kemang's.
    expect(row).toEqual(
      expect.objectContaining({
        services_processed: 2,
        days_worked: 3,
        per_day_worked: 0.67,
        qc_checks: 2,
        qc_rejects: 1,
        complaints: 0,
        complaint_cohort: 1,
        // Right now, not in August: the 4 August Shift he never closed.
        live: {
          clock_in_at: jkt("2026-08-04T08:00"),
          clock_out_at: null,
          in_hand: 0,
          last_move_at: null,
          services_today: 0,
        },
      })
    );
    // Nothing he started reached QC on 4 or 5 August.
    expect(await barsOf(adi, shop.store.id)).toEqual({
      "2026-08-03": 2,
      "2026-08-04": 0,
      "2026-08-05": 0,
    });
  });

  it("charges a Complaint to whoever cleaned the round that passed, never to a Rework", async () => {
    const report = await kemangAugust();

    expect(report.workers.find((r) => r.user_id === bayu)).toEqual(
      expect.objectContaining({
        // His Rework counts as a Repair processed.
        services_processed: 1,
        // 3 August redoing the Repair, 20 August on the Rework.
        days_worked: 2,
        qc_checks: 2,
        qc_rejects: 0,
        complaints: 1,
        complaint_cohort: 1,
      })
    );
  });

  it("puts each Store's people on their own rows when no Store is named", async () => {
    const report = await getWorkerProductivityReport(AUGUST);

    expect(
      report.workers.map((row) => [
        row.store_name,
        row.user_name,
        row.services_processed,
        row.days_worked,
      ])
    ).toEqual([
      ["Fresclean Bintaro", "Bayu", 1, 1],
      ["Fresclean Bintaro", "Adi", 0, 1],
      ["Fresclean Kemang", "Adi", 2, 3],
      ["Fresclean Kemang", "Ayu Admin", 1, 1],
      ["Fresclean Kemang", "Bayu", 1, 2],
      ["Fresclean Kemang", "Citra", 0, 2],
    ]);
    // Adi and Bayu worked both Stores but are one person each.
    expect(report.summary.current.people).toBe(4);
  });

  it("splits each person's Services by Service, a Rework in its own Service", async () => {
    const report = await kemangAugust();

    expect(report.services_matrix.services).toEqual([
      { service_id: shop.serviceId, service_name: "Deep Clean", total: 2 },
      { service_id: shop.repairServiceId, service_name: "Repair", total: 2 },
    ]);
    expect(report.services_matrix.cells).toHaveLength(4);
    expect(report.services_matrix.cells).toEqual(
      expect.arrayContaining([
        {
          user_id: adi,
          store_id: shop.store.id,
          service_id: shop.serviceId,
          count: 1,
        },
        {
          user_id: adi,
          store_id: shop.store.id,
          service_id: shop.repairServiceId,
          count: 1,
        },
        {
          user_id: shop.admin.id,
          store_id: shop.store.id,
          service_id: shop.serviceId,
          count: 1,
        },
        {
          user_id: bayu,
          store_id: shop.store.id,
          service_id: shop.repairServiceId,
          count: 1,
        },
      ])
    );
  });

  it("counts a cashier's or admin's Shift only where they started a Service", async () => {
    // Cahya clocks in to run the Kemang counter and starts nothing. Ayu clocks
    // in at Kemang, where she started a pair, and at Bintaro, where she didn't.
    await clockIn(
      shop.cashier.id,
      shop.store.id,
      jkt("2026-08-03T08:00"),
      jkt("2026-08-03T17:00")
    );
    await clockIn(
      shop.admin.id,
      shop.store.id,
      jkt("2026-08-04T08:00"),
      jkt("2026-08-04T17:00")
    );
    await clockIn(
      shop.admin.id,
      bintaro.id,
      jkt("2026-08-05T08:00"),
      jkt("2026-08-05T17:00")
    );

    const report = await getWorkerProductivityReport(AUGUST);

    expect(report.workers.map((row) => row.user_id)).not.toContain(
      shop.cashier.id
    );
    expect(
      report.workers
        .filter((row) => row.user_id === shop.admin.id)
        .map((row) => [row.store_name, row.days_worked])
    ).toEqual([["Fresclean Kemang", 1]]);
    // Adi 4 over both Stores, Bayu 3, Citra 2 and Ayu's day at Kemang, which is
    // her Shift and her move on 4 August together.
    expect(report.summary.current).toEqual(
      expect.objectContaining({ days_worked: 10, people: 4 })
    );
  });

  it("answers the previous stretch with headline figures only", async () => {
    const report = await kemangAugust();

    expect(report.is_today).toBe(false);
    expect(report.summary.previous).toEqual({
      services_processed: 0,
      days_worked: 0,
      people: 0,
      per_day_worked: 0,
      daily_p25: null,
      daily_p75: null,
      qc_checks: 0,
      qc_rejects: 0,
      qc_reject_rate: 0,
      complaints: 0,
      complaint_cohort: 0,
      complaint_rate: 0,
    });
  });

  it("drops the per-person bars and the Time in work table", async () => {
    const report = await kemangAugust();

    expect(report).not.toHaveProperty("time_in_work");
    expect(report).not.toHaveProperty("daily_labels");
    expect(report).not.toHaveProperty("daily_bucket");
    expect(report.workers[0]).not.toHaveProperty("daily");
  });

  describe("a worker's detail page", () => {
    const itemCodeOf = async (brand: string) => {
      const item = await testDb.query.itemsTable.findFirst({
        where: { brand },
      });
      return item?.item_code ?? "";
    };

    it("lists the Services finished each day, 0 on a day worked with none and nothing on a day away", async () => {
      const detail = await detailOf(adi, shop.store.id);
      const day = (label: string) =>
        detail.buckets.find((bucket) => bucket.label === label);

      expect(detail).toEqual(
        expect.objectContaining({
          store_id: shop.store.id,
          store_name: "Fresclean Kemang",
          user_id: adi,
          user_name: "Adi",
          role: "worker",
          bucket: "day",
        })
      );
      expect(detail.buckets).toHaveLength(31);
      expect(day("2026-08-01")).toEqual(
        expect.objectContaining({ worked: false, total: null, services: [] })
      );
      expect(day("2026-08-03")).toEqual(
        expect.objectContaining({
          worked: true,
          total: 2,
          services: [
            {
              service_id: shop.serviceId,
              service_name: "Deep Clean",
              count: 1,
            },
            {
              service_id: shop.repairServiceId,
              service_name: "Repair",
              count: 1,
            },
          ],
        })
      );
      expect(day("2026-08-04")).toEqual(
        expect.objectContaining({ worked: true, total: 0, services: [] })
      );
      // Bintaro's day is not Kemang's.
      expect(day("2026-08-06")?.total).toBeNull();
      expect(detail.services).toEqual([
        { service_id: shop.serviceId, service_name: "Deep Clean", count: 1 },
        { service_id: shop.repairServiceId, service_name: "Repair", count: 1 },
      ]);
    });

    it("averages the Services of every worker at the Store who worked or finished one that day", async () => {
      const detail = await detailOf(adi, shop.store.id);
      const average = (label: string) =>
        detail.buckets.find((bucket) => bucket.label === label)?.store_average;

      // 3 Aug: Adi finished 2, Bayu and Citra worked and finished none. The
      // admin starts pairs but is not a worker, so she is not in the average.
      expect(average("2026-08-03")).toBe(0.67);
      // 4 Aug: only Adi worked, with nothing finished.
      expect(average("2026-08-04")).toBe(0);
      // 20 Aug: Bayu finished 1, Citra worked and finished none.
      expect(average("2026-08-20")).toBe(0.5);
      expect(average("2026-08-01")).toBeNull();
    });

    it("charges a QC reject to the cleaner of the round, with the inspector's note when there is one", async () => {
      const { redo } = await placeOrder(shop.store, [
        { brand: "redo", serviceId: shop.serviceId },
      ]);
      await log(redo.lineId, [
        ["queued", "processing", bayu, jkt("2026-08-21T09:00")],
        ["processing", "quality_check", bayu, jkt("2026-08-21T10:00")],
      ]);
      await testDb.insert(orderServiceStatusLogsTable).values({
        changed_by: citra,
        created_at: jkt("2026-08-21T11:00"),
        from_status: "quality_check",
        note: "Sole still stained",
        order_service_id: redo.lineId,
        to_status: "qc_reject",
      });

      const adis = await detailOf(adi, shop.store.id);
      const bayus = await detailOf(bayu, shop.store.id);

      // Citra sent Adi's Repair back on 3 Aug; Bayu redid it and passed.
      expect(adis.qc_rejects).toEqual([
        {
          service_id: shop.repairServiceId,
          service_name: "Repair",
          rejects: 1,
          checks: 1,
          items: [
            {
              order_id: expect.any(Number),
              order_service_id: expect.any(Number),
              item_code: await itemCodeOf("adi-repair"),
              rejected_at: "2026-08-03T07:00:00.000Z",
              note: null,
            },
          ],
        },
      ]);
      // Bayu's own round was sent back; Adi's reject is not his.
      expect(bayus.qc_rejects).toEqual([
        {
          service_id: shop.serviceId,
          service_name: "Deep Clean",
          rejects: 1,
          checks: 1,
          items: [
            {
              order_id: redo.orderId,
              order_service_id: redo.lineId,
              item_code: await itemCodeOf("redo"),
              rejected_at: "2026-08-21T04:00:00.000Z",
              note: "Sole still stained",
            },
          ],
        },
      ]);
    });

    it("lists the Complaints on Items whose passing round the person cleaned", async () => {
      const bayus = await detailOf(bayu, shop.store.id);
      const [complaint] = await testDb.select().from(complaintsTable);

      expect(bayus.complaints).toEqual([
        {
          service_id: shop.repairServiceId,
          service_name: "Repair",
          complaints: 1,
          finished: 1,
          items: [
            {
              complaint_id: complaint?.id,
              order_id: expect.any(Number),
              order_service_id: complaint?.order_service_id,
              item_code: await itemCodeOf("adi-repair"),
              opened_at: complaint?.created_at.toISOString(),
              reason: "Still dirty",
            },
          ],
        },
      ]);
      // Adi started that Repair but did not clean the round that passed.
      expect((await detailOf(adi, shop.store.id)).complaints).toEqual([]);
    });

    it("answers zeros for someone with nothing at the Store, the Store's average still drawn", async () => {
      const detail = await detailOf(citra, bintaro.id);

      expect(detail.facts).toEqual({
        days_worked: 0,
        services_processed: 0,
        per_day_worked: null,
        qc_checks: 0,
        qc_rejects: 0,
        complaints: 0,
        complaint_cohort: 0,
      });
      expect(detail.services).toEqual([]);
      expect(detail.qc_rejects).toEqual([]);
      expect(detail.complaints).toEqual([]);
      expect(detail.buckets.every((bucket) => bucket.total === null)).toBe(
        true
      );
      // 6 Aug at Bintaro: Bayu finished 1, Adi worked and finished none.
      expect(
        detail.buckets.flatMap((bucket) =>
          bucket.store_average === null
            ? []
            : [[bucket.label, bucket.store_average]]
        )
      ).toEqual([["2026-08-06", 0.5]]);
    });

    it("refuses a user who does not exist", async () => {
      await expect(detailOf(999_999, shop.store.id)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it("gives the same facts as that person's row on the Workers tab", async () => {
      const tab = await kemangAugust();

      for (const row of tab.workers) {
        const { facts } = await detailOf(row.user_id, shop.store.id);

        expect(facts).toEqual({
          days_worked: row.days_worked,
          services_processed: row.services_processed,
          per_day_worked: row.per_day_worked,
          qc_checks: row.qc_checks,
          qc_rejects: row.qc_rejects,
          complaints: row.complaints,
          complaint_cohort: row.complaint_cohort,
        });
      }
    });
  });
});

describe("a round that passes after the stretch", () => {
  it("gives its cleaner no row when they did nothing else in the stretch, Citra's checks aside", async () => {
    const { repair } = await placeOrder(shop.store, [
      { brand: "repair", serviceId: shop.repairServiceId },
    ]);
    // Adi starts it on 31 August; Bayu's redo passes on 1 September.
    await log(repair.lineId, [
      ["queued", "processing", adi, jkt("2026-08-31T09:00")],
      ["processing", "quality_check", adi, jkt("2026-08-31T10:00")],
      ["quality_check", "qc_reject", citra, jkt("2026-08-31T11:00")],
      ["qc_reject", "processing", bayu, jkt("2026-09-01T09:00")],
      ["processing", "quality_check", bayu, jkt("2026-09-01T10:00")],
      ["quality_check", "ready_for_pickup", citra, jkt("2026-09-01T11:00")],
    ]);

    const report = await getWorkerProductivityReport({
      ...AUGUST,
      store_id: shop.store.id,
    });

    // Citra sent it back on 31 August, so she has a day worked; Bayu's redo
    // is in September.
    expect(report.workers.map((row) => row.user_id)).toEqual([adi, citra]);
  });
});

describe("a worker's usual day", () => {
  // Citra works six days at Kemang, finishing 0 to 5 pairs a day, and one
  // more pair reaches QC on a day she never clocked in.
  beforeEach(async () => {
    const days = [
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
    ];
    const plan: {
      brand: string;
      day: string;
      hours: number;
      repair: boolean;
    }[] = [];
    days.forEach((day, perDay) => {
      for (let n = 0; n < perDay; n += 1) {
        // The last day's five pairs are Repairs, taking 1 to 5 hours.
        const repair = day === "2026-08-15";
        plan.push({
          brand: `${day}-${n}`,
          day,
          hours: repair ? n + 1 : 2,
          repair,
        });
      }
    });
    plan.push({
      brand: "no-shift",
      day: "2026-08-16",
      hours: 2,
      repair: false,
    });

    const placed = await placeOrder(
      shop.store,
      plan.map(({ brand, repair }) => ({
        brand,
        serviceId: repair ? shop.repairServiceId : shop.serviceId,
      }))
    );
    for (const { brand, day, hours } of plan) {
      const start = jkt(`${day}T08:00`);
      await log(placed[brand].lineId, [
        ["queued", "processing", citra, start],
        [
          "processing",
          "quality_check",
          citra,
          new Date(start.getTime() + hours * 3_600_000),
        ],
      ]);
    }
    for (const day of days) {
      await clockIn(
        citra,
        shop.store.id,
        jkt(`${day}T07:30`),
        jkt(`${day}T18:00`)
      );
    }
  });

  it("spreads her days worked, a day with nothing finished counted as 0", async () => {
    const report = await getWorkerProductivityReport({
      ...AUGUST,
      store_id: shop.store.id,
    });

    expect(report.workers).toEqual([
      expect.objectContaining({
        user_id: citra,
        services_processed: 16,
        days_worked: 7,
        per_day_worked: 2.29,
      }),
    ]);
    // 0, 1, 2, 3, 4, 5, and the pair on her day without a Shift, which she
    // still started that day.
    expect(report.summary.current).toEqual(
      expect.objectContaining({ daily_p25: 1, daily_p75: 3.5 })
    );
  });

  it("gives her a bar a day: 0 on a day worked with nothing finished, none on a day away", async () => {
    const detail = await detailOf(citra, shop.store.id);

    expect(detail.bucket).toBe("day");
    expect(detail.buckets).toHaveLength(31);
    expect(detail.buckets[0].label).toBe("2026-08-01");
    expect(detail.buckets[0].total).toBeNull();
    expect(await barsOf(citra, shop.store.id)).toEqual({
      "2026-08-10": 0,
      "2026-08-11": 1,
      "2026-08-12": 2,
      "2026-08-13": 3,
      "2026-08-14": 4,
      "2026-08-15": 5,
      // Not clocked in, but a pair of hers reached QC.
      "2026-08-16": 1,
    });
  });

  it("goes to a bar a week, Monday to Sunday, past two months", async () => {
    const range = { from: "2026-07-01", to: "2026-09-30" };
    const detail = await detailOf(citra, shop.store.id, range);

    expect(detail.bucket).toBe("week");
    // The first week starts on the Monday before 1 July.
    expect(detail.buckets).toHaveLength(14);
    expect(detail.buckets[0].label).toBe("2026-06-29");
    expect(detail.buckets.at(-1)?.label).toBe("2026-09-28");
    expect(await barsOf(citra, shop.store.id, range)).toEqual({
      "2026-08-10": 16,
    });
  });
});

// Pilot shops track Shifts in another app, so most days worked here come from
// the bench moves alone.
describe("days worked by people who rarely clock in", () => {
  const report = (storeId?: number) =>
    getWorkerProductivityReport({ ...AUGUST, store_id: storeId });
  const startAndSend = (line: Line, by: number, day: string) =>
    log(line.lineId, [
      ["queued", "processing", by, jkt(`${day}T09:00`)],
      ["processing", "quality_check", by, jkt(`${day}T10:00`)],
    ]);

  it("counts the days a worker with no Shift started Items, and divides by them", async () => {
    const lines = await placeOrder(shop.store, [
      { brand: "a", serviceId: shop.serviceId },
      { brand: "b", serviceId: shop.serviceId },
      { brand: "c", serviceId: shop.serviceId },
      { brand: "d", serviceId: shop.serviceId },
    ]);
    await startAndSend(lines.a, bayu, "2026-08-10");
    await startAndSend(lines.b, bayu, "2026-08-10");
    await startAndSend(lines.c, bayu, "2026-08-12");
    await startAndSend(lines.d, bayu, "2026-08-14");

    const { workers } = await report(shop.store.id);

    expect(workers).toEqual([
      expect.objectContaining({
        user_id: bayu,
        services_processed: 4,
        days_worked: 3,
        per_day_worked: 1.33,
      }),
    ]);
  });

  it("counts a Shift and a move on the same day at the same Store once", async () => {
    const { a } = await placeOrder(shop.store, [
      { brand: "a", serviceId: shop.serviceId },
    ]);
    await clockIn(
      bayu,
      shop.store.id,
      jkt("2026-08-10T08:00"),
      jkt("2026-08-10T17:00")
    );
    await startAndSend(a, bayu, "2026-08-10");

    const { workers } = await report(shop.store.id);

    expect(workers[0]).toEqual(
      expect.objectContaining({ user_id: bayu, days_worked: 1 })
    );
  });

  it("gives a cashier who only handed Items back no row and no day", async () => {
    const lines = await placeOrder(shop.store, [
      { brand: "a", serviceId: shop.serviceId },
      { brand: "b", serviceId: shop.serviceId },
    ]);
    await log(lines.a.lineId, [
      [
        "ready_for_pickup",
        "picked_up",
        shop.cashier.id,
        jkt("2026-08-10T15:00"),
      ],
    ]);
    await log(lines.b.lineId, [
      [
        "ready_for_pickup",
        "picked_up",
        shop.cashier.id,
        jkt("2026-08-11T15:00"),
      ],
    ]);

    const { workers, summary } = await report(shop.store.id);

    expect(workers).toEqual([]);
    expect(summary.current.days_worked).toBe(0);
  });

  it("counts a move on a Store B Item towards the Store B row, not Store A", async () => {
    const atKemang = await placeOrder(shop.store, [
      { brand: "kemang", serviceId: shop.serviceId },
    ]);
    const atBintaro = await placeOrder(bintaro, [
      { brand: "bintaro", serviceId: shop.serviceId },
    ]);
    await startAndSend(atKemang.kemang, bayu, "2026-08-11");
    await startAndSend(atBintaro.bintaro, bayu, "2026-08-10");

    const both = await report();

    expect(
      both.workers.map((row) => [row.store_name, row.days_worked])
    ).toEqual([
      ["Fresclean Bintaro", 1],
      ["Fresclean Kemang", 1],
    ]);
    expect(await barsOf(bayu, shop.store.id)).toEqual({ "2026-08-11": 1 });
  });

  it("spreads over days with a finished Service even when the worker has no move or Shift that day", async () => {
    // Bayu starts on 10 to 12 August; the admin sends each to QC on 20 to 22
    // August, so Bayu's Services land on days he did nothing else.
    const lines = await placeOrder(shop.store, [
      { brand: "a", serviceId: shop.serviceId },
      { brand: "b", serviceId: shop.serviceId },
      { brand: "c", serviceId: shop.serviceId },
    ]);
    const plan: [Line, string, string][] = [
      [lines.a, "2026-08-10", "2026-08-20"],
      [lines.b, "2026-08-11", "2026-08-21"],
      [lines.c, "2026-08-12", "2026-08-22"],
    ];
    for (const [line, started, sent] of plan) {
      await log(line.lineId, [
        ["queued", "processing", bayu, jkt(`${started}T09:00`)],
        ["processing", "quality_check", shop.admin.id, jkt(`${sent}T10:00`)],
      ]);
    }

    const full = await report(shop.store.id);

    expect(full.workers).toEqual([
      expect.objectContaining({ user_id: bayu, days_worked: 3 }),
    ]);
    expect(await barsOf(bayu, shop.store.id)).toEqual({
      "2026-08-10": 0,
      "2026-08-11": 0,
      "2026-08-12": 0,
      "2026-08-20": 1,
      "2026-08-21": 1,
      "2026-08-22": 1,
    });
    // Six days, three of them 0 and three 1; three days alone would be too few.
    expect(full.summary.current).toEqual(
      expect.objectContaining({ daily_p25: 0, daily_p75: 1 })
    );
  });
});

describe("the Workers report for today", () => {
  const today = jakartaNow().format("YYYY-MM-DD");
  const dayStart = getJakartaDayRange(today).start.getTime();
  const at = (hours: number) => new Date(dayStart + hours * 3_600_000);

  beforeEach(async () => {
    const lines = await placeOrder(shop.store, [
      { brand: "on-bench", serviceId: shop.serviceId },
      { brand: "done", serviceId: shop.serviceId },
    ]);

    // Adi went out at 02:00, came back at 03:00 and is still on shift.
    await clockIn(adi, shop.store.id, at(1), at(2));
    await clockIn(adi, shop.store.id, at(3), null);

    await log(lines.done.lineId, [
      ["queued", "processing", adi, at(1.5)],
      ["processing", "quality_check", adi, at(5)],
    ]);
    await log(lines["on-bench"].lineId, [["queued", "processing", adi, at(4)]]);
    await testDb
      .update(ordersServicesTable)
      .set({ handler_id: adi, status: "processing" })
      .where(eq(ordersServicesTable.id, lines["on-bench"].lineId));
  });

  it("shows who is on shift, what is in their hands and when they last moved", async () => {
    const report = await getWorkerProductivityReport({
      from: today,
      to: today,
      store_id: shop.store.id,
    });

    expect(report.is_today).toBe(true);
    expect(report.workers.find((row) => row.user_id === adi)?.live).toEqual({
      clock_in_at: at(3),
      clock_out_at: null,
      in_hand: 1,
      last_move_at: at(5),
      services_today: 1,
    });
  });

  const todayAtKemang = () =>
    getWorkerProductivityReport({
      from: today,
      to: today,
      store_id: shop.store.id,
    });

  it("lists someone with pairs in hand before anything they started reaches QC", async () => {
    // Bayu took two pairs off the rack and hasn't clocked in.
    const lines = await placeOrder(shop.store, [
      { brand: "first", serviceId: shop.serviceId },
      { brand: "second", serviceId: shop.serviceId },
    ]);
    await testDb
      .update(ordersServicesTable)
      .set({ handler_id: bayu, status: "processing" })
      .where(
        inArray(ordersServicesTable.id, [
          lines.first.lineId,
          lines.second.lineId,
        ])
      );

    const report = await todayAtKemang();

    expect(report.workers.find((row) => row.user_id === bayu)).toEqual(
      expect.objectContaining({
        services_processed: 0,
        days_worked: 0,
        live: {
          clock_in_at: null,
          clock_out_at: null,
          in_hand: 2,
          last_move_at: null,
          services_today: 0,
        },
      })
    );
  });

  it("lists someone still on a Shift they opened before today", async () => {
    await clockIn(citra, shop.store.id, at(-2), null);

    const report = await todayAtKemang();

    expect(report.workers.find((row) => row.user_id === citra)).toEqual(
      expect.objectContaining({
        days_worked: 0,
        live: {
          clock_in_at: at(-2),
          clock_out_at: null,
          in_hand: 0,
          last_move_at: null,
          services_today: 0,
        },
      })
    );
  });

  it("leaves out a cashier whose only moves today were pickups", async () => {
    const lines = await placeOrder(shop.store, [
      { brand: "collected", serviceId: shop.serviceId },
    ]);
    await log(lines.collected.lineId, [
      ["ready_for_pickup", "picked_up", shop.cashier.id, at(1)],
    ]);

    const report = await todayAtKemang();

    expect(
      report.workers.find((row) => row.user_id === shop.cashier.id)
    ).toBeUndefined();
  });

  it("does not count a handover at the counter as a last move", async () => {
    const lines = await placeOrder(shop.store, [
      { brand: "collected", serviceId: shop.serviceId },
    ]);
    await log(lines.collected.lineId, [
      ["ready_for_pickup", "picked_up", adi, at(6)],
    ]);

    const report = await todayAtKemang();

    expect(
      report.workers.find((row) => row.user_id === adi)?.live.last_move_at
    ).toEqual(at(5));
  });

  it("gives a cashier holding an Item the same day in her sheet as in her row", async () => {
    // She clocked in to run the counter but took one pair to the bench.
    const lines = await placeOrder(shop.store, [
      { brand: "hers", serviceId: shop.serviceId },
    ]);
    await clockIn(shop.cashier.id, shop.store.id, at(3), null);
    await testDb
      .update(ordersServicesTable)
      .set({ handler_id: shop.cashier.id, status: "processing" })
      .where(eq(ordersServicesTable.id, lines.hers.lineId));

    const report = await todayAtKemang();
    const row = report.workers.find((r) => r.user_id === shop.cashier.id);
    const { facts } = await detailOf(shop.cashier.id, shop.store.id, {
      from: today,
      to: today,
    });

    expect(row?.days_worked).toBe(1);
    expect(facts.days_worked).toBe(1);
  });

  it("shows the live view on a week too, Services today apart from the week's", async () => {
    // Adi also finished a pair yesterday evening.
    const { yesterday } = await placeOrder(shop.store, [
      { brand: "yesterday", serviceId: shop.serviceId },
    ]);
    await log(yesterday.lineId, [
      ["queued", "processing", adi, at(-6)],
      ["processing", "quality_check", adi, at(-5)],
    ]);

    const report = await getWorkerProductivityReport({
      from: shiftDate(today, -6),
      to: today,
      store_id: shop.store.id,
    });
    const row = report.workers.find((r) => r.user_id === adi);

    expect(report.is_today).toBe(false);
    expect(row?.services_processed).toBe(2);
    expect(row?.live).toEqual({
      clock_in_at: at(3),
      clock_out_at: null,
      in_hand: 1,
      last_move_at: at(5),
      services_today: 1,
    });
  });

  it("keeps a cashier's Shift off the bench on a week where she cleaned a pair days ago", async () => {
    // She cleaned one pair two days ago and only runs the counter today.
    const { earlier } = await placeOrder(shop.store, [
      { brand: "earlier", serviceId: shop.serviceId },
    ]);
    await log(earlier.lineId, [
      ["queued", "processing", shop.cashier.id, at(-40)],
      ["processing", "quality_check", shop.cashier.id, at(-39)],
    ]);
    await clockIn(shop.cashier.id, shop.store.id, at(3), null);

    const report = await getWorkerProductivityReport({
      from: shiftDate(today, -6),
      to: today,
      store_id: shop.store.id,
    });

    expect(
      report.workers.find((row) => row.user_id === shop.cashier.id)?.live
    ).toEqual(expect.objectContaining({ clock_in_at: null }));
  });

  it("puts a cashier who checked a pair today on shift whatever the stretch", async () => {
    const { checked } = await placeOrder(shop.store, [
      { brand: "checked", serviceId: shop.serviceId },
    ]);
    await log(checked.lineId, [
      ["queued", "processing", adi, at(-40)],
      ["processing", "quality_check", adi, at(-39)],
      ["quality_check", "ready_for_pickup", shop.cashier.id, at(4)],
    ]);
    await clockIn(shop.cashier.id, shop.store.id, at(3), null);

    for (const from of [today, shiftDate(today, -30)]) {
      const report = await getWorkerProductivityReport({
        from,
        to: today,
        store_id: shop.store.id,
      });
      expect(
        report.workers.find((row) => row.user_id === shop.cashier.id)?.live
      ).toEqual(
        expect.objectContaining({ clock_in_at: at(3), last_move_at: at(4) })
      );
    }
  });

  it("gives no last move to someone whose last bench move was before today", async () => {
    const { checked } = await placeOrder(shop.store, [
      { brand: "checked", serviceId: shop.serviceId },
    ]);
    await log(checked.lineId, [
      ["quality_check", "ready_for_pickup", citra, at(-5)],
    ]);

    const report = await getWorkerProductivityReport({
      from: shiftDate(today, -6),
      to: today,
      store_id: shop.store.id,
    });

    expect(report.workers.find((row) => row.user_id === citra)).toEqual(
      expect.objectContaining({
        days_worked: 1,
        live: expect.objectContaining({ last_move_at: null }),
      })
    );
  });

  it("lists someone busy today on a stretch that ended yesterday, with nothing in it", async () => {
    const yesterday = shiftDate(today, -1);
    const report = await getWorkerProductivityReport({
      from: yesterday,
      to: yesterday,
      store_id: shop.store.id,
    });

    expect(report.workers).toEqual([
      expect.objectContaining({
        user_id: adi,
        services_processed: 0,
        days_worked: 0,
        live: {
          clock_in_at: at(3),
          clock_out_at: null,
          in_hand: 1,
          last_move_at: at(5),
          services_today: 1,
        },
      }),
    ]);
    // Today's work never reaches yesterday's figures.
    expect(report.summary.current).toEqual(
      expect.objectContaining({ services_processed: 0, days_worked: 0 })
    );
  });

  it("shows a Shift clocked out today, so a worker who went home is not one who never clocked in", async () => {
    await clockIn(bayu, shop.store.id, at(1), at(4));

    const report = await todayAtKemang();

    expect(report.workers.find((row) => row.user_id === bayu)?.live).toEqual(
      expect.objectContaining({ clock_in_at: at(1), clock_out_at: at(4) })
    );
  });
});
