import { beforeEach, describe, expect, it, mock } from "bun:test";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { DateRange } from "@/modules/reports/report-range.util";

// Whole statements, byte for byte: an added `or paid_at is null` leaves every
// substring in place while quietly changing which Orders count as takings.

const queries: { params: unknown[]; sql: string }[] = [];

mock.module("@/db", () => ({
  db: drizzle((sql, params) => {
    queries.push({ sql, params });
    return Promise.resolve({ rows: [] });
  }),
}));

const repo = await import("@/modules/reports/report-range.repository");

// August 2026 as Jakarta sees it: opens 01 Aug 00:00 WIB, closes the instant
// 01 Sep 00:00 WIB begins.
const AUGUST: DateRange = {
  start: new Date("2026-07-31T17:00:00.000Z"),
  end: new Date("2026-08-31T17:00:00.000Z"),
};

const KEMANG = 3;
const DAY = "day" as const;

beforeEach(() => {
  queries.length = 0;
});

const askedFor = async (run: () => Promise<unknown>) => {
  await run();

  expect(queries.length).toBeGreaterThan(0);

  return queries.map((query) => ({
    params: query.params,
    sql: query.sql.replace(/\s+/g, " ").trim(),
  }));
};

type Query = (storeId?: number) => Promise<unknown>;

const QUERIES: [string, Query][] = [
  [
    "services gross sales",
    (storeId) =>
      repo.listServicesGrossSalesSeries({
        granularity: DAY,
        range: AUGUST,
        storeId,
      }),
  ],
  [
    "products gross sales",
    (storeId) =>
      repo.listProductsGrossSalesSeries({
        granularity: DAY,
        range: AUGUST,
        storeId,
      }),
  ],
  [
    "services COGS",
    (storeId) =>
      repo.listServicesCogsSeries({ granularity: DAY, range: AUGUST, storeId }),
  ],
  [
    "products COGS",
    (storeId) =>
      repo.listProductsCogsSeries({ granularity: DAY, range: AUGUST, storeId }),
  ],
  [
    "order discount",
    (storeId) =>
      repo.listOrderDiscountSeries({
        granularity: DAY,
        range: AUGUST,
        storeId,
      }),
  ],
  [
    "collected",
    (storeId) =>
      repo.listCollectedSeries({ granularity: DAY, range: AUGUST, storeId }),
  ],
  [
    "store collected",
    (storeId) => repo.listStoreCollectedRows({ range: AUGUST, storeId }),
  ],
  [
    "store refunds",
    (storeId) => repo.listStoreRefundRows({ range: AUGUST, storeId }),
  ],
  [
    "category gross sales",
    (storeId) =>
      repo.listCategoryGrossSalesSeries({
        granularity: DAY,
        range: AUGUST,
        storeId,
      }),
  ],
  [
    "store x category gross sales",
    (storeId) =>
      repo.listStoreCategoryGrossSalesRows({ range: AUGUST, storeId }),
  ],
  [
    "orders taken in",
    (storeId) =>
      repo.listOrdersInSeries({ granularity: DAY, range: AUGUST, storeId }),
  ],
  [
    "orders handed back",
    (storeId) =>
      repo.listOrdersOutSeries({ granularity: DAY, range: AUGUST, storeId }),
  ],
  [
    "payment mix",
    (storeId) =>
      repo.listPaymentMixSeries({ granularity: DAY, range: AUGUST, storeId }),
  ],
  [
    "new customers",
    (storeId) =>
      repo.listNewCustomersSeries({ granularity: DAY, range: AUGUST, storeId }),
  ],
  [
    "returning customer orders",
    (storeId) =>
      repo.listReturningCustomerOrdersSeries({
        granularity: DAY,
        range: AUGUST,
        storeId,
      }),
  ],
  [
    "top customers",
    (storeId) => repo.listTopCustomers({ range: AUGUST, storeId }),
  ],
  [
    "customers on file before the stretch",
    (storeId) =>
      repo.findCumulativeCustomersBefore({ before: AUGUST.start, storeId }),
  ],
  [
    "repeat customer stats",
    (storeId) => repo.findRepeatCustomerStats({ range: AUGUST, storeId }),
  ],
  [
    "refund amounts",
    (storeId) =>
      repo.listRefundAmountSeries({ granularity: DAY, range: AUGUST, storeId }),
  ],
  [
    "worker productivity",
    (storeId) => repo.listWorkerActivity({ range: AUGUST, storeId }),
  ],
  [
    "worker productivity headline",
    (storeId) => repo.listWorkerSummaryActivity({ range: AUGUST, storeId }),
  ],
  [
    "worker QC checks",
    (storeId) =>
      repo.listQcChecksOfCleaner({ range: AUGUST, storeId, userId: 7 }),
  ],
  ["worker Complaint items", () => repo.listComplaintItems([11, 12])],
  [
    "worker live activity",
    (storeId) => repo.listWorkerLiveActivity({ range: AUGUST, storeId }),
  ],
  [
    "campaign effectiveness",
    (storeId) => repo.listCampaignEffectivenessRows({ range: AUGUST, storeId }),
  ],
];

describe("what each money report asks Postgres for one store", () => {
  for (const [name, run] of QUERIES) {
    it(`asks the same question for ${name}`, async () => {
      expect(await askedFor(() => run(KEMANG))).toMatchSnapshot();
    });
  }
});

describe("what each money report asks Postgres for the whole company", () => {
  // A Store filter left behind when nobody named a Store is as wrong as one
  // dropped, so both shapes are recorded.
  for (const [name, run] of QUERIES) {
    it(`asks the same question for ${name}`, async () => {
      expect(await askedFor(() => run())).toMatchSnapshot();
    });
  }
});
