import { beforeEach, describe, expect, it, mock } from "bun:test";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { DateRange } from "@/modules/reports/report-range.util";

// How much work the shop got through is a question about when each treatment
// first passed inspection, not about how many log rows it left behind. A
// pg-proxy driver stands in for the database: Drizzle builds the real
// statement, we capture it and answer with rows we chose. Nothing connects.

const queries: { params: unknown[]; sql: string }[] = [];
const rowQueue: unknown[][] = [];

mock.module("@/db", () => ({
  db: drizzle((sql, params) => {
    queries.push({ sql, params });
    return Promise.resolve({ rows: rowQueue.shift() ?? [] });
  }),
}));

const { countServicesProcessed, listServicesProcessed } = await import(
  "@/modules/reports/services-processed"
);

// August 2026 as Jakarta sees it: opens 01 Aug 00:00 WIB, closes the instant
// 01 Sep 00:00 WIB begins.
const AUGUST: DateRange = {
  start: new Date("2026-07-31T17:00:00.000Z"),
  end: new Date("2026-08-31T17:00:00.000Z"),
};

const KEMANG = 3;
const FIRST_REACHED_QC = 'MIN("order_service_status_logs"."created_at")';
const PER_LINE = 'group by "order_service_status_logs"."order_service_id"';

beforeEach(() => {
  queries.length = 0;
  rowQueue.length = 0;
});

const only = () => {
  expect(queries).toHaveLength(1);
  return queries[0];
};

describe("what makes a treatment count as processed", () => {
  it("counts reaching inspection, and counts each line once", async () => {
    await listServicesProcessed({ range: AUGUST });

    expect(only().params[0]).toBe("quality_check");
    expect(only().sql).toContain(PER_LINE);
  });

  it("files a line under the stretch it first passed, not the stretch of its redo", async () => {
    // A shoe checked in July, sent back and checked again in August leaves an
    // August log row too. Testing the stretch against the first check is what
    // keeps that line in July's count and out of August's.
    await listServicesProcessed({ range: AUGUST });

    const having = only().sql.slice(only().sql.indexOf("having"));

    expect(having).toContain(`${FIRST_REACHED_QC} >= $`);
    expect(having).toContain(`${FIRST_REACHED_QC} < $`);
  });

  it("hands Postgres the two edges of the stretch as the column writes them", async () => {
    // Sent as bare dates, the driver stamps them in whatever clock the machine
    // runs on, and August's count quietly becomes 31 August 5pm to 31 August
    // 5pm on a laptop in Jakarta.
    await listServicesProcessed({ range: AUGUST });

    expect(only().params.slice(1)).toEqual([
      "2026-08-31T17:00:00.000Z",
      "2026-07-31T17:00:00.000Z",
      "2026-08-31T17:00:00.000Z",
    ]);
  });

  it("keeps one store's work to that store alone", async () => {
    await listServicesProcessed({ range: AUGUST, storeId: KEMANG });

    expect(only().sql).toContain('"orders"."store_id" = $');
    expect(only().params).toContain(KEMANG);
  });
});

describe("the day's processed count", () => {
  it("counts the lines that passed, not the inspections they sat through", async () => {
    rowQueue.push([[4]]);

    expect(await countServicesProcessed({ range: AUGUST })).toBe(4);
    expect(only().sql).toContain(PER_LINE);
  });

  it("answers nothing processed with a zero, not a blank", async () => {
    expect(await countServicesProcessed({ range: AUGUST })).toBe(0);
  });
});
