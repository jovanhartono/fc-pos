import { beforeEach, describe, expect, it, mock } from "bun:test";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { DateRange } from "@/modules/reports/report-range.util";

const queries: string[] = [];

mock.module("@/db", () => ({
  db: drizzle((sql) => {
    queries.push(sql.replace(/\s+/g, " "));
    return Promise.resolve({ rows: [] });
  }),
}));

const repo = await import("@/modules/users/user-performance.repository");

const NOVEMBER: DateRange = {
  start: new Date("2026-10-31T17:00:00.000Z"),
  end: new Date("2026-11-30T17:00:00.000Z"),
};

beforeEach(() => {
  queries.length = 0;
});

// A cashier's Profile page once answered 500: the count named "qc_log" in its
// conditions but read the table under its plain name.
describe("a cashier's own figures", () => {
  it("reads the QC log under the name its conditions use", async () => {
    await repo.countQcChecksDoneBy(2, NOVEMBER);

    expect(queries[0]).toContain('from "order_service_status_logs" "qc_log"');
    expect(queries[0]).toContain('"qc_log"."changed_by" = $');
  });
});
