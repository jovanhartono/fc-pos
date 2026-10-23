import { beforeEach, describe, expect, it, mock } from "bun:test";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { DateRange } from "@/modules/reports/report-range.util";

// A fake row is a positional array in the query's column order, not a named
// object: pg-proxy speaks the raw wire shape.

const queries: { params: unknown[]; sql: string }[] = [];
const rowQueue: unknown[][] = [];

mock.module("@/db", () => ({
  db: drizzle((sql, params) => {
    queries.push({ sql, params });
    return Promise.resolve({ rows: rowQueue.shift() ?? [] });
  }),
}));

const {
  categoryGrossSalesForRange,
  perStoreForRange,
  sumDailyPaid,
  topServicesForRange,
} = await import("@/modules/reports/report.repository");

// Saturday 1 August 2026 as Jakarta sees it.
const SATURDAY: DateRange = {
  start: new Date("2026-07-31T17:00:00.000Z"),
  end: new Date("2026-08-01T17:00:00.000Z"),
};

beforeEach(() => {
  queries.length = 0;
  rowQueue.length = 0;
});

const only = () => {
  expect(queries).toHaveLength(1);
  return queries[0];
};

describe("which orders the overview panels count", () => {
  // Work dropped off on Saturday and paid for on Monday is Monday's money.
  it("counts a category's sales on the day the counter took the money", async () => {
    await categoryGrossSalesForRange({ range: SATURDAY });

    expect(only().sql).toContain('"orders"."paid_at" >= $1');
    expect(only().sql).toContain('"orders"."paid_at" < $2');
    expect(only().sql).not.toContain('"orders"."created_at"');
  });

  it("counts the day's busiest services the same way", async () => {
    await topServicesForRange({ range: SATURDAY });

    expect(only().sql).toContain('"orders"."paid_at" >= $1');
    expect(only().sql).not.toContain('"orders"."created_at"');
  });
});

describe("reading rupiah back out of Postgres", () => {
  // numeric(12,0) arrives as a string. Left as one, the overview's additions
  // turn into string joins.
  it("turns a day's takings into a number the report can add", async () => {
    rowQueue.push([["500000"]]);

    expect(await sumDailyPaid({ range: SATURDAY })).toBe(500_000);
  });

  it("takes a store's refunds off that store's own takings", async () => {
    rowQueue.push([[1, "600000", 4]]);
    rowQueue.push([[1, "100000"]]);
    rowQueue.push([[1, "KEM", "Kemang"]]);

    expect(await perStoreForRange({ range: SATURDAY })).toEqual([
      {
        store_id: 1,
        store_code: "KEM",
        store_name: "Kemang",
        revenue: 500_000,
        orders: 4,
        share: 1,
      },
    ]);
  });

  // Same order as Financial's Store leaderboard, so the two tabs agree.
  it("lists the Store that took the most first", async () => {
    rowQueue.push([
      [1, "100000", 1],
      [2, "300000", 2],
    ]);
    rowQueue.push([]);
    rowQueue.push([
      [1, "BSD", "BSD"],
      [2, "KEM", "Kemang"],
    ]);

    const rows = await perStoreForRange({ range: SATURDAY });

    expect(rows.map((row) => row.store_code)).toEqual(["KEM", "BSD"]);
    expect(rows.map((row) => row.share)).toEqual([0.75, 0.25]);
  });
});
