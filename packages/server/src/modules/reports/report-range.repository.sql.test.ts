import { beforeEach, describe, expect, it, mock } from "bun:test";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { DateRange } from "@/modules/reports/report-range.util";

// The reports repository is about to be collapsed from 21 hand-written queries
// into a few shared builders, and its contract is "ask Postgres the same
// question, with less code to read". So these record the whole statement each
// report sends today, byte for byte.
//
// Substring checks cannot hold that line: adding `or paid_at is null` beside an
// intact window, or moving the window into a LEFT JOIN ... ON, leaves every
// substring in place while quietly changing which orders count as takings. A
// snapshot sees both.

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
    "services revenue",
    (storeId) =>
      repo.listServicesRevenueSeries({
        granularity: DAY,
        range: AUGUST,
        storeId,
      }),
  ],
  [
    "products revenue",
    (storeId) =>
      repo.listProductsRevenueSeries({
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
    "category revenue",
    (storeId) =>
      repo.listCategoryRevenueSeries({
        granularity: DAY,
        range: AUGUST,
        storeId,
      }),
  ],
  [
    "store x category revenue",
    (storeId) => repo.listStoreCategoryRevenueRows({ range: AUGUST, storeId }),
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
    "distinct handlers",
    (storeId) => repo.findDistinctHandlerCount({ range: AUGUST, storeId }),
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
    "refund reasons",
    (storeId) =>
      repo.listRefundReasonSeries({ granularity: DAY, range: AUGUST, storeId }),
  ],
  [
    "worker productivity",
    (storeId) => repo.listWorkerProductivityRows({ range: AUGUST, storeId }),
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
  // Naming no store is the other half of the contract: a dedupe that leaves a
  // store filter behind when nobody asked for one is as wrong as one that drops
  // it, and only recording both shapes catches that.
  for (const [name, run] of QUERIES) {
    it(`asks the same question for ${name}`, async () => {
      expect(await askedFor(() => run())).toMatchSnapshot();
    });
  }
});

describe("the store nobody can scope", () => {
  it("asks for every store's takings, because it takes no store", async () => {
    // listStoreRevenueRows has no storeId parameter, so the store_breakdown panel
    // on a Kemang-scoped financial report carries every store's takings. Every
    // reader of these reports is an admin today, so this is recorded rather than
    // fixed — but a filter appearing here should be a deliberate change.
    expect(
      await askedFor(() => repo.listStoreRevenueRows({ range: AUGUST }))
    ).toMatchSnapshot();
  });
});
