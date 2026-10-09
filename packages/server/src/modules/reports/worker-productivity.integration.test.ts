import "@/test-support/pglite";
import { beforeEach, describe, expect, it } from "bun:test";
import { orderServiceStatusLogsTable, usersTable } from "@/db/schema";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";

// Loaded after the swap above, never beside the imports: Bun binds a static
// import graph before any module body runs, so a service pulled in up there
// would hold the shop's real database.
const { createOrder } = await import("@/modules/orders/order.service");
const { getWorkerProductivityReport } = await import(
  "@/modules/reports/report-range.service"
);

const AUGUST = { from: "2026-08-01", to: "2026-08-31" };

// Wall-clock time at the shop.
const jkt = (local: string) => new Date(`${local}:00+07:00`);

type Status = (typeof orderServiceStatusLogsTable.$inferInsert)["to_status"];

let shop: Shop;
let adi: number;
let bayu: number;
let citra: number;
let lineIds: Record<string, number>;

const log = (
  lineId: number,
  steps: [Status | null, Status, number, string][]
) =>
  testDb.insert(orderServiceStatusLogsTable).values(
    steps.map(([from, to, by, at]) => ({
      changed_by: by,
      created_at: jkt(at),
      from_status: from,
      order_service_id: lineId,
      to_status: to,
    }))
  );

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

  const order = await createOrder(shop.admin.id, shop.store, {
    campaign_ids: [],
    customer: { name: "Budi Santoso", phone_number: "+628111222333" },
    discount: 0,
    items: ["handed-on", "redone-by-adi"].map((brand) => ({
      brand,
      services: [{ id: shop.serviceId }],
    })),
    payment_method_id: shop.paymentMethodId,
    payment_status: "unpaid",
    store_id: shop.store.id,
    voucher_codes: [],
  });
  const items = await testDb.query.itemsTable.findMany({
    where: { order_id: order.id },
    with: { services: true },
  });
  lineIds = Object.fromEntries(
    items.map((item) => [item.brand ?? "", item.services[0].id])
  );
});

// Adi's round is sent back; Bayu picks the pair up and his round is sent back
// too.
const sentBackTwice = (): [Status, Status, number, string][] => [
  ["queued", "processing", adi, "2026-08-03T09:00"],
  ["processing", "quality_check", adi, "2026-08-03T10:00"],
  ["quality_check", "qc_reject", citra, "2026-08-03T11:00"],
  ["qc_reject", "processing", bayu, "2026-08-03T12:00"],
  ["processing", "quality_check", bayu, "2026-08-03T13:00"],
  ["quality_check", "qc_reject", citra, "2026-08-03T14:00"],
];

const report = () =>
  getWorkerProductivityReport({ ...AUGUST, store_id: shop.store.id });

const workerRow = async (userId: number) =>
  (await report()).workers.find((row) => row.user_id === userId);

describe("the Workers report", () => {
  beforeEach(async () => {
    await log(lineIds["handed-on"], sentBackTwice());

    // Adi redoes his own pair and it is sent back a second time.
    await log(lineIds["redone-by-adi"], [
      ["queued", "processing", adi, "2026-08-04T09:00"],
      ["processing", "quality_check", adi, "2026-08-04T10:00"],
      ["quality_check", "qc_reject", citra, "2026-08-04T11:00"],
      ["qc_reject", "processing", adi, "2026-08-04T12:00"],
      ["processing", "quality_check", adi, "2026-08-04T13:00"],
      ["quality_check", "qc_reject", citra, "2026-08-04T14:00"],
    ]);
  });

  it("charges each QC reject to whoever cleaned that round", async () => {
    expect(await workerRow(adi)).toMatchObject({
      services_processed: 2,
      qc_checks: 3,
      qc_reject_events: 3,
      qc_reject_items: 2,
      qc_reject_rate: 1,
    });
    // Bayu cleaned a round but started neither pair, so he processed nothing.
    expect(await workerRow(bayu)).toMatchObject({
      services_processed: 0,
      qc_checks: 1,
      qc_reject_events: 1,
      qc_reject_items: 1,
      qc_reject_rate: 1,
    });
    expect(await workerRow(citra)).toMatchObject({
      services_processed: 0,
      qc_checks: 0,
      qc_reject_events: 0,
      qc_reject_items: 0,
      qc_reject_rate: 0,
    });
  });

  it("counts Bayu among the active workers on his QC reject alone", async () => {
    expect((await report()).summary.current).toMatchObject({
      worker_count: 2,
      total_services_processed: 2,
      total_qc_checks: 4,
      total_qc_rejects: 4,
      total_qc_reject_items: 2,
      qc_reject_rate: 1,
    });
  });
});

describe("the QC reject rate on the Workers report", () => {
  beforeEach(async () => {
    // Bayu redoes the pair a second time and it passes.
    await log(lineIds["handed-on"], [
      ...sentBackTwice(),
      ["qc_reject", "processing", bayu, "2026-08-03T15:00"],
      ["processing", "quality_check", bayu, "2026-08-03T16:00"],
      ["quality_check", "ready_for_pickup", citra, "2026-08-03T17:00"],
    ]);
  });

  it("divides each cleaner's rejects by the checks of rounds they cleaned", async () => {
    expect(await workerRow(adi)).toMatchObject({
      qc_checks: 1,
      qc_reject_events: 1,
      qc_reject_rate: 1,
    });
    expect(await workerRow(bayu)).toMatchObject({
      qc_checks: 2,
      qc_reject_events: 1,
      qc_reject_rate: 0.5,
    });
  });

  it("divides the shop's rejects by every check in the stretch", async () => {
    expect((await report()).summary.current).toMatchObject({
      total_qc_checks: 3,
      total_qc_rejects: 2,
      total_qc_reject_items: 1,
      qc_reject_rate: 2 / 3,
    });
  });
});
