import { beforeEach, describe, expect, it, mock } from "bun:test";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { DateRange } from "@/modules/reports/report-range.util";

// Every takings figure on the reports page is a SUM inside Postgres, so the
// question these tests answer is not "what did the shop earn" but "which rows
// did we ask Postgres to add up, and from which column". A pg-proxy driver
// stands in for the database: Drizzle still builds the real statement, we
// capture it, and hand back rows we chose. Nothing connects.
//
// pg-proxy speaks the raw wire shape, so a fake row is a positional array in
// the order the query selects its columns — not a named object.

const queries: { params: unknown[]; sql: string }[] = [];
const rowQueue: unknown[][] = [];

mock.module("@/db", () => ({
  db: drizzle((sql, params) => {
    queries.push({ sql, params });
    return Promise.resolve({ rows: rowQueue.shift() ?? [] });
  }),
}));

const {
  listCampaignEffectivenessRows,
  listPaymentMixSeries,
  listRefundAmountSeries,
  listServicesRevenueSeries,
} = await import("@/modules/reports/report-range.repository");

// August 2026 as Jakarta sees it: opens 01 Aug 00:00 WIB, closes the instant
// 01 Sep 00:00 WIB begins.
const AUGUST: DateRange = {
  start: new Date("2026-07-31T17:00:00.000Z"),
  end: new Date("2026-08-31T17:00:00.000Z"),
};

const KEMANG = 3;

beforeEach(() => {
  queries.length = 0;
  rowQueue.length = 0;
});

const only = () => {
  expect(queries).toHaveLength(1);
  return queries[0];
};

// report-range.repository.sql.test.ts snapshots all 21 statements in full, so
// what each query asks Postgres is pinned there. These two stay behind as the
// tripwire for a blind `--update-snapshots`: the paid window and the store filter
// are the two rules that decide what counts as takings, and a regenerated
// snapshot would record them wrong just as happily as right.
describe("which orders count as takings", () => {
  it("counts a stretch from the moment the till took the money", async () => {
    // >= on the closing instant would bill the 1st of September twice, once to
    // each month.
    await listServicesRevenueSeries({ range: AUGUST, granularity: "day" });

    expect(only().sql).toContain('"orders"."paid_at" >= $1');
    expect(only().sql).toContain('"orders"."paid_at" < $2');
    expect(only().params[0]).toBe(AUGUST.start.toISOString());
    expect(only().params[1]).toBe(AUGUST.end.toISOString());
  });

  it("keeps one store's takings to that store alone", async () => {
    await listServicesRevenueSeries({
      granularity: "day",
      range: AUGUST,
      storeId: KEMANG,
    });

    expect(only().sql).toContain('"orders"."store_id" = $');
    expect(only().params).toContain(KEMANG);
  });
});

describe("grouping takings into chart bars", () => {
  // Postgres must cut the day at Jakarta midnight, not UTC midnight, or the
  // shop's evening trade lands on tomorrow's bar.
  const formats = [
    { fmt: "YYYY-MM-DD", granularity: "day" as const },
    { fmt: "IYYY-IW", granularity: "week" as const },
    { fmt: "YYYY-MM", granularity: "month" as const },
    { fmt: "YYYY", granularity: "year" as const },
  ];

  for (const { fmt, granularity } of formats) {
    it(`cuts ${granularity} bars at Jakarta midnight`, async () => {
      await listServicesRevenueSeries({ range: AUGUST, granularity });

      const expr = `to_char("orders"."paid_at" AT TIME ZONE 'Asia/Jakarta', '${fmt}')`;
      expect(only().sql).toContain(`select ${expr},`);
      expect(only().sql).toContain(`group by ${expr}`);
    });
  }
});

describe("reading rupiah back out of Postgres", () => {
  // numeric(12,0) arrives as a string. Left as one, the report's additions turn
  // into string joins and a day's takings render as "500000120000".
  it("turns a day's service takings into a number the report can add", async () => {
    rowQueue.push([
      ["2026-08-01", "500000"],
      ["2026-08-02", "0"],
    ]);

    const rows = await listServicesRevenueSeries({
      range: AUGUST,
      granularity: "day",
    });

    expect(rows).toEqual([
      { bucket: "2026-08-01", revenue: 500_000 },
      { bucket: "2026-08-02", revenue: 0 },
    ]);
  });

  it("turns refunds handed back into numbers, counted alongside their amount", async () => {
    rowQueue.push([["2026-08-03", "75000", 2]]);

    const rows = await listRefundAmountSeries({
      range: AUGUST,
      granularity: "day",
    });

    expect(rows).toEqual([
      { bucket: "2026-08-03", amount: 75_000, refunds: 2 },
    ]);
  });

  it("files takings with no recorded payment method under Unknown", async () => {
    // Legacy orders paid before the method was mandatory still carry money the
    // mix chart has to place somewhere.
    rowQueue.push([["2026-08-01", null, null, "250000", 4]]);

    const rows = await listPaymentMixSeries({
      range: AUGUST,
      granularity: "day",
    });

    expect(rows).toEqual([
      {
        bucket: "2026-08-01",
        payment_method_id: 0,
        payment_method_name: "Unknown",
        revenue: 250_000,
        orders: 4,
      },
    ]);
  });

  it("averages a promo's order value without rounding to whole rupiah", async () => {
    // Three Rp10.000-ish orders on one voucher: the average lands between
    // rupiah and is reported as-is, sen and all.
    rowQueue.push([[7, "Grand Opening", "OPEN26", "9000"]]);
    rowQueue.push([
      [7, 101, "9000", "10000"],
      [7, 102, "9001", "10001"],
      [7, 103, "9001", "10001"],
    ]);

    const rows = await listCampaignEffectivenessRows({ range: AUGUST });

    expect(rows).toEqual([
      {
        campaign_id: 7,
        campaign_name: "Grand Opening",
        campaign_code: "OPEN26",
        orders: 3,
        revenue: 27_002,
        discount_cost: 9000,
        avg_order_value: 30_002 / 3,
      },
    ]);
  });
});
