import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import {
  complaintsTable,
  orderRefundItemsTable,
  orderRefundsTable,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  storesTable,
  usersTable,
} from "@/db/schema";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// August at the Kemang shop, told through the status log. Adi, Bayu and Citra
// take turns cleaning and checking; some pairs pass first time, some are sent
// back at QC and redone, some come back from the Customer as a Complaint.

// Loaded after the swap above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the shop's real database.
const { createOrder } = await import("@/modules/orders/order.service");
const { getQualityReport, getQcRejectsReport } = await import(
  "@/modules/reports/quality.service"
);

const AUGUST = { from: "2026-08-01", to: "2026-08-31" };

// Wall-clock time at the shop.
const jkt = (local: string) => new Date(`${local}:00+07:00`);

type Status = (typeof orderServiceStatusLogsTable.$inferInsert)["to_status"];

interface Line {
  itemCode: string;
  itemId: number;
  lineId: number;
  orderCode: string;
  orderId: number;
}

let shop: Shop;
let bintaroId: number;
let adi: number;
let bayu: number;
let citra: number;
let lines: Record<string, Line>;

const placeOrder = async (
  store: Shop["store"],
  items: { brand: string; serviceId: number }[]
) => {
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
    with: { services: true, order: true },
  });
  return Object.fromEntries(
    placed.map((item) => [
      item.brand ?? "",
      {
        itemCode: item.item_code,
        itemId: item.id,
        lineId: item.services[0].id,
        orderCode: item.order.code,
        orderId: item.order_id,
      },
    ])
  );
};

const log = (
  lineId: number,
  steps: [Status | null, Status, number, string, string?][]
) =>
  testDb.insert(orderServiceStatusLogsTable).values(
    steps.map(([from, to, by, at, note]) => ({
      changed_by: by,
      created_at: jkt(at),
      from_status: from,
      note: note ?? null,
      order_service_id: lineId,
      to_status: to,
    }))
  );

const setStatus = (lineId: number, status: Status) =>
  testDb
    .update(ordersServicesTable)
    .set({ status })
    .where(eq(ordersServicesTable.id, lineId));

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

const addReworkLine = async (
  line: Line,
  complaintId: number,
  serviceId: number,
  status: Status
) => {
  const [rework] = await testDb
    .insert(ordersServicesTable)
    .values({
      complaint_id: complaintId,
      item_id: line.itemId,
      order_id: line.orderId,
      price: "0",
      service_id: serviceId,
      status,
    })
    .returning();
  return rework.id;
};

const refund = async (
  line: Line,
  at: string,
  reason: "damaged" | "lost" | "cannot_process",
  amount: number,
  note: string | null
) => {
  const [handedBack] = await testDb
    .insert(orderRefundsTable)
    .values({
      created_at: jkt(at),
      order_id: line.orderId,
      refunded_by: shop.admin.id,
      total_amount: String(amount),
    })
    .returning();
  const [item] = await testDb
    .insert(orderRefundItemsTable)
    .values({
      amount: String(amount),
      note,
      order_refund_id: handedBack.id,
      order_service_id: line.lineId,
      reason,
    })
    .returning();
  return item.id;
};

let reworkLineId: number;
let refundIds: { damaged: number; lost: number };

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

  const [bintaro] = await testDb
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
  bintaroId = bintaro.id;

  const clean = shop.serviceId;
  const repair = shop.repairServiceId;
  lines = {
    ...(await placeOrder(shop.store, [
      { brand: "first-pass", serviceId: clean },
      { brand: "redone", serviceId: clean },
      { brand: "self-checked", serviceId: repair },
      { brand: "refunded", serviceId: clean },
      { brand: "july", serviceId: clean },
      { brand: "rejected-after-range", serviceId: clean },
      { brand: "pending", serviceId: clean },
      { brand: "cancelled", serviceId: clean },
      { brand: "repaired", serviceId: repair },
    ])),
    ...(await placeOrder(bintaro, [{ brand: "bintaro", serviceId: clean }])),
  };
  const line = (brand: string) => lines[brand].lineId;

  // Adi cleans, Bayu passes it. First try.
  await log(line("first-pass"), [
    ["queued", "processing", adi, "2026-08-02T10:00"],
    ["processing", "quality_check", adi, "2026-08-02T12:00"],
    ["quality_check", "ready_for_pickup", bayu, "2026-08-02T13:00"],
  ]);

  // Bayu sends Adi's work back; Citra redoes it and passes her own redo.
  await log(line("redone"), [
    ["queued", "processing", adi, "2026-08-03T09:00"],
    ["processing", "quality_check", adi, "2026-08-03T10:00"],
    [
      "quality_check",
      "qc_reject",
      bayu,
      "2026-08-03T11:00",
      "stain on toe box",
    ],
    ["qc_reject", "processing", citra, "2026-08-03T12:00"],
    ["processing", "quality_check", citra, "2026-08-03T13:00"],
    ["quality_check", "ready_for_pickup", citra, "2026-08-03T14:00"],
  ]);

  // Adi repairs and passes his own work; the Customer complains, and the
  // Rework line Bayu does is sent back by Citra.
  await log(line("self-checked"), [
    ["queued", "processing", adi, "2026-08-04T09:00"],
    ["processing", "quality_check", adi, "2026-08-04T10:00"],
    ["quality_check", "ready_for_pickup", adi, "2026-08-04T11:00"],
  ]);
  const reworkedComplaint = await complain(lines["self-checked"]);
  reworkLineId = await addReworkLine(
    lines["self-checked"],
    reworkedComplaint,
    repair,
    "qc_reject"
  );
  await log(reworkLineId, [
    ["queued", "processing", bayu, "2026-08-11T09:00"],
    ["processing", "quality_check", bayu, "2026-08-11T10:00"],
    ["quality_check", "qc_reject", citra, "2026-08-11T11:00", "glue marks"],
  ]);

  // Sent back before reasons were asked for, then passed by Adi, then
  // refunded as damaged after the Customer complained.
  await log(line("refunded"), [
    ["queued", "processing", bayu, "2026-08-05T09:00"],
    ["processing", "quality_check", bayu, "2026-08-05T10:00"],
    ["quality_check", "qc_reject", citra, "2026-08-05T11:00"],
    ["qc_reject", "processing", bayu, "2026-08-05T12:00"],
    ["processing", "quality_check", bayu, "2026-08-05T13:00"],
    ["quality_check", "ready_for_pickup", adi, "2026-08-05T14:00"],
  ]);
  await complain(lines.refunded);
  await setStatus(line("refunded"), "refunded");

  // July's work: the stretch before.
  await log(line("july"), [
    ["queued", "processing", adi, "2026-07-20T09:00"],
    ["processing", "quality_check", adi, "2026-07-20T10:00"],
    ["quality_check", "qc_reject", bayu, "2026-07-20T11:00", "scuffs"],
    ["qc_reject", "processing", adi, "2026-07-20T12:00"],
    ["processing", "quality_check", adi, "2026-07-20T13:00"],
    ["quality_check", "ready_for_pickup", bayu, "2026-07-20T14:00"],
  ]);

  // Checked in August, sent back the instant September opens.
  await log(line("rejected-after-range"), [
    ["queued", "processing", citra, "2026-08-30T09:00"],
    ["processing", "quality_check", citra, "2026-08-30T10:00"],
    ["quality_check", "qc_reject", bayu, "2026-09-01T00:00", "still wet"],
  ]);

  // Complained about; the Rework line was cancelled, so nothing was redone.
  await log(line("pending"), [
    ["queued", "processing", citra, "2026-08-06T09:00"],
    ["processing", "quality_check", citra, "2026-08-06T10:00"],
    ["quality_check", "ready_for_pickup", bayu, "2026-08-06T11:00"],
  ]);
  const pendingComplaint = await complain(lines.pending);
  await addReworkLine(lines.pending, pendingComplaint, clean, "cancelled");

  await log(line("cancelled"), [
    ["queued", "processing", citra, "2026-08-07T09:00"],
    ["processing", "quality_check", citra, "2026-08-07T10:00"],
    ["quality_check", "ready_for_pickup", bayu, "2026-08-07T11:00"],
  ]);
  await complain(lines.cancelled);
  await setStatus(line("cancelled"), "cancelled");

  await log(line("repaired"), [
    ["queued", "processing", bayu, "2026-08-09T09:00"],
    ["processing", "quality_check", bayu, "2026-08-09T10:00"],
    ["quality_check", "ready_for_pickup", citra, "2026-08-09T11:00"],
  ]);

  await log(line("bintaro"), [
    ["queued", "processing", adi, "2026-08-08T09:00"],
    ["processing", "quality_check", adi, "2026-08-08T10:00"],
    ["quality_check", "qc_reject", bayu, "2026-08-08T11:00", "other store"],
  ]);

  refundIds = {
    damaged: await refund(
      lines.refunded,
      "2026-08-20T10:00",
      "damaged",
      100_000,
      "Sole split"
    ),
    lost: await refund(
      lines["first-pass"],
      "2026-08-21T10:00",
      "lost",
      80_000,
      null
    ),
  };
  await refund(
    lines.redone,
    "2026-08-22T10:00",
    "cannot_process",
    50_000,
    null
  );
  await refund(lines.bintaro, "2026-08-22T10:00", "damaged", 70_000, "torn");
  await refund(lines.july, "2026-07-25T10:00", "damaged", 60_000, "faded");
});

const kemangAugust = () =>
  getQualityReport({ ...AUGUST, store_id: shop.store.id });

describe("the Quality report", () => {
  it("adds August's work up into the headline figures", async () => {
    const report = await kemangAugust();

    // Eight lines first reached QC in August. The Rework line and July's pair
    // are not among them.
    expect(report.summary.current).toEqual({
      services_processed: 8,
      first_pass: 5,
      sent_back: 3,
      first_pass_rate: 0.625,
      complaints: 4,
      complaint_rate: 0.5,
      qc_rejects: 3,
      passes: 7,
      self_checks: 2,
      self_check_rate: 0.2857,
    });
  });

  it("compares against July", async () => {
    const report = await kemangAugust();

    expect(report.previous).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(report.summary.previous).toEqual({
      services_processed: 1,
      first_pass: 0,
      sent_back: 1,
      first_pass_rate: 0,
      complaints: 0,
      complaint_rate: 0,
      qc_rejects: 1,
      passes: 1,
      self_checks: 0,
      self_check_rate: 0,
    });
    expect(report.summary.deltas.qc_rejects).toEqual({
      current: 3,
      previous: 1,
      delta_pct: 2,
    });
    expect(report.summary.deltas.first_pass_rate?.delta_pct).toBeNull();
  });

  it("counts a pair sent back after the range as sent back, but not its QC reject", async () => {
    // Checked on 30 August, rejected the instant September opened: the pair
    // is August's work that has been sent back so far, while the reject
    // itself belongs to September.
    const report = await kemangAugust();
    const rejects = await getQcRejectsReport({
      ...AUGUST,
      store_id: shop.store.id,
    });

    expect(report.summary.current.sent_back).toBe(3);
    expect(report.summary.current.qc_rejects).toBe(3);
    expect(rejects.items.map((row) => row.reason)).not.toContain("still wet");
  });

  it("reads each Complaint's outcome off its lines", async () => {
    const report = await kemangAugust();

    expect(report.complaint_outcomes).toEqual({
      reworked: 1,
      refunded: 1,
      cancelled: 1,
      pending: 1,
    });
  });

  it("ranks Services with the worst first-pass rate first", async () => {
    const report = await kemangAugust();

    expect(report.by_service).toEqual([
      {
        service_id: shop.serviceId,
        service_name: "Deep Clean",
        processed: 6,
        first_pass: 3,
        first_pass_rate: 0.5,
        sent_back: 3,
        complaints: 3,
      },
      {
        service_id: shop.repairServiceId,
        service_name: "Repair",
        processed: 2,
        first_pass: 2,
        first_pass_rate: 1,
        sent_back: 0,
        complaints: 1,
      },
    ]);
  });

  it("credits each check to the checker and spots who checked their own work", async () => {
    const report = await kemangAugust();

    expect(report.by_checker).toEqual([
      {
        user_id: bayu,
        user_name: "Bayu",
        checks: 4,
        passes: 3,
        rejects: 1,
        reject_rate: 0.25,
        self_checks: 0,
        self_check_rate: 0,
        complaints_after: 2,
      },
      {
        // Citra passed her own redo of Adi's pair: a Self-check.
        user_id: citra,
        user_name: "Citra",
        checks: 4,
        passes: 2,
        rejects: 2,
        reject_rate: 0.5,
        self_checks: 1,
        self_check_rate: 0.5,
        complaints_after: 0,
      },
      {
        user_id: adi,
        user_name: "Adi",
        checks: 2,
        passes: 2,
        rejects: 0,
        reject_rate: 0,
        self_checks: 1,
        self_check_rate: 0.5,
        complaints_after: 2,
      },
    ]);
  });

  it("lists Items refunded as damaged or lost, newest first", async () => {
    const report = await kemangAugust();

    expect(report.damaged_lost).toEqual([
      {
        refund_item_id: refundIds.lost,
        refunded_at: jkt("2026-08-21T10:00"),
        order_id: lines["first-pass"].orderId,
        order_code: lines["first-pass"].orderCode,
        item_code: lines["first-pass"].itemCode,
        service_name: "Deep Clean",
        store_code: "KMG",
        reason: "lost",
        amount: 80_000,
        note: null,
      },
      {
        refund_item_id: refundIds.damaged,
        refunded_at: jkt("2026-08-20T10:00"),
        order_id: lines.refunded.orderId,
        order_code: lines.refunded.orderCode,
        item_code: lines.refunded.itemCode,
        service_name: "Deep Clean",
        store_code: "KMG",
        reason: "damaged",
        amount: 100_000,
        note: "Sole split",
      },
    ]);
  });

  it("takes in every Store when none is named", async () => {
    const report = await getQualityReport(AUGUST);

    expect(report.summary.current.services_processed).toBe(9);
    expect(report.summary.current.qc_rejects).toBe(4);
    expect(report.damaged_lost.map((row) => row.store_code)).toEqual([
      "BTR",
      "KMG",
      "KMG",
    ]);
  });
});

describe("the QC rejects list", () => {
  it("names who cleaned the round that was sent back, newest first", async () => {
    const page = await getQcRejectsReport({
      ...AUGUST,
      store_id: shop.store.id,
    });

    expect(page.meta).toEqual({ total: 3, limit: 50, offset: 0 });
    expect(page.items).toEqual([
      {
        id: expect.any(Number),
        rejected_at: jkt("2026-08-11T11:00"),
        order_id: lines["self-checked"].orderId,
        order_code: lines["self-checked"].orderCode,
        item_code: lines["self-checked"].itemCode,
        service_name: "Repair",
        store_code: "KMG",
        store_name: "Fresclean Kemang",
        cleaned_by_name: "Bayu",
        rejected_by_name: "Citra",
        reason: "glue marks",
      },
      {
        // Rejected before a reason was required.
        id: expect.any(Number),
        rejected_at: jkt("2026-08-05T11:00"),
        order_id: lines.refunded.orderId,
        order_code: lines.refunded.orderCode,
        item_code: lines.refunded.itemCode,
        service_name: "Deep Clean",
        store_code: "KMG",
        store_name: "Fresclean Kemang",
        cleaned_by_name: "Bayu",
        rejected_by_name: "Citra",
        reason: null,
      },
      {
        id: expect.any(Number),
        rejected_at: jkt("2026-08-03T11:00"),
        order_id: lines.redone.orderId,
        order_code: lines.redone.orderCode,
        item_code: lines.redone.itemCode,
        service_name: "Deep Clean",
        store_code: "KMG",
        store_name: "Fresclean Kemang",
        cleaned_by_name: "Adi",
        rejected_by_name: "Bayu",
        reason: "stain on toe box",
      },
    ]);
  });

  it("pages through the list", async () => {
    const first = await getQcRejectsReport({
      ...AUGUST,
      store_id: shop.store.id,
      limit: 2,
    });
    const second = await getQcRejectsReport({
      ...AUGUST,
      store_id: shop.store.id,
      limit: 2,
      offset: 2,
    });

    expect(first.meta).toEqual({ total: 3, limit: 2, offset: 0 });
    expect(first.items.map((row) => row.reason)).toEqual(["glue marks", null]);
    expect(second.meta).toEqual({ total: 3, limit: 2, offset: 2 });
    expect(second.items.map((row) => row.reason)).toEqual(["stain on toe box"]);
  });

  it("totals the same QC rejects the report counts", async () => {
    for (const storeId of [shop.store.id, bintaroId, undefined]) {
      const report = await getQualityReport({ ...AUGUST, store_id: storeId });
      const page = await getQcRejectsReport({ ...AUGUST, store_id: storeId });

      expect(page.meta.total).toBe(report.summary.current.qc_rejects);
    }
  });

  it("keeps another Store's QC rejects out", async () => {
    const page = await getQcRejectsReport({ ...AUGUST, store_id: bintaroId });

    expect(page.items.map((row) => [row.store_code, row.reason])).toEqual([
      ["BTR", "other store"],
    ]);
  });
});
