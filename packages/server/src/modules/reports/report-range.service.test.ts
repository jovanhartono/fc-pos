import { beforeEach, describe, expect, it, mock } from "bun:test";
import { drizzle } from "drizzle-orm/pg-proxy";
import { getJakartaDayRange } from "@/modules/reports/report-range.util";

// Turning day-rows into the figures on the reports page is plain arithmetic:
// fill the days the shop was shut, walk a day's takings down from what was
// charged to what the shop kept, then compare against the stretch before.
//
// A pg-proxy driver stands in for the database — Drizzle builds the real
// statement, we recognise which figure it asks for and answer with rows we
// chose. Money arrives as strings because that is what numeric(12,0) sends, so
// these fixtures exercise the whole path from Postgres text to rendered rupiah.
// What each query *means* is pinned in report-range.repository.test.ts.

const FROM = "2026-08-01";
const TO = "2026-08-03";

// Aug 1–3 is a 3-day stretch, so the comparison stretch is Jul 29–31.
const NOW_START = getJakartaDayRange(FROM).start.toISOString();

type Rows = unknown[][];
type Period = "before" | "now";

const noRows = (): Record<Period, Rows> => ({ now: [], before: [] });

const answers = {
  storeCategory: noRows(),
  storeRevenue: noRows(),
  categoryRevenue: noRows(),
  discount: noRows(),
  paymentMix: noRows(),
  products: noRows(),
  productsCogs: noRows(),
  refundReasons: noRows(),
  refunds: noRows(),
  services: noRows(),
  servicesCogs: noRows(),
};

// The summed column is what tells two otherwise identical queries apart, which
// is exactly the distinction a repository dedupe could lose.
const figureOf = (sql: string): keyof typeof answers => {
  if (sql.includes('SUM("orders_products"."subtotal")')) {
    return "products";
  }
  if (sql.includes('SUM("orders_products"."cogs_snapshot")')) {
    return "productsCogs";
  }
  if (sql.includes('SUM("orders_services"."cogs_snapshot")')) {
    return "servicesCogs";
  }
  if (sql.includes('SUM("order_refunds"."total_amount")')) {
    return "refunds";
  }
  if (sql.includes('SUM("order_refund_items"."amount")')) {
    return "refundReasons";
  }
  if (sql.includes('SUM("discount")')) {
    return "discount";
  }
  if (sql.includes('SUM("orders"."paid_amount")')) {
    return "storeRevenue";
  }
  if (sql.includes('SUM("orders_services"."subtotal")')) {
    if (sql.includes('"stores"')) {
      return "storeCategory";
    }
    if (sql.includes('"categories"')) {
      return "categoryRevenue";
    }
    return "services";
  }
  throw new Error(`No fixture knows what this query asks for: ${sql}`);
};

const sent: { params: unknown[]; sql: string }[] = [];

mock.module("@/db", () => ({
  db: drizzle((sql, params) => {
    sent.push({ params, sql });
    const figure = sql.includes('"payment_methods"')
      ? "paymentMix"
      : figureOf(sql);
    const period: Period = params[0] === NOW_START ? "now" : "before";
    return Promise.resolve({ rows: answers[figure][period] });
  }),
}));

const { getFinancialReport, getPaymentMixReport, getRefundTrendReport } =
  await import("@/modules/reports/report-range.service");

const financial = () => getFinancialReport({ from: FROM, to: TO });

const takings = (bucket: string, amount: number) => [bucket, String(amount)];

beforeEach(() => {
  sent.length = 0;
  for (const key of Object.keys(answers) as (keyof typeof answers)[]) {
    answers[key] = noRows();
  }

  // Saturday: a full day of laundry plus soap sold off the shelf, with a
  // Rp20.000 promo off the whole order.
  // Sunday: shut — Postgres returns no row for it at all.
  // Monday: services only, and Rp75.000 handed back for Saturday's ruined shirt.
  answers.services.now = [
    takings("2026-08-01", 500_000),
    takings("2026-08-03", 300_000),
  ];
  answers.products.now = [takings("2026-08-01", 120_000)];
  answers.servicesCogs.now = [
    takings("2026-08-01", 150_000),
    takings("2026-08-03", 90_000),
  ];
  answers.productsCogs.now = [takings("2026-08-01", 60_000)];
  answers.discount.now = [takings("2026-08-01", 20_000)];
  answers.refunds.now = [["2026-08-03", "75000", 1]];

  answers.services.before = [takings("2026-07-29", 700_000)];
  answers.products.before = [takings("2026-07-29", 100_000)];
  answers.servicesCogs.before = [takings("2026-07-29", 200_000)];
  answers.productsCogs.before = [takings("2026-07-29", 50_000)];
});

describe("the day-by-day money chart", () => {
  it("gives the Sunday the shop was shut a bar at zero", async () => {
    // Dropping the day with no trade would slide Monday's bar into Sunday's slot
    // and shorten the chart.
    const report = await financial();

    expect(report.series.map((row) => row.bucket)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
    expect(report.series[1]).toEqual({
      bucket: "2026-08-02",
      services: 0,
      products: 0,
      gross_revenue: 0,
      discount: 0,
      net_revenue: 0,
      cogs: 0,
      gross_profit: 0,
      refunds: 0,
      net_income: 0,
    });
  });

  it("walks Saturday from what was charged down to what the shop kept", async () => {
    const report = await financial();

    expect(report.series[0]).toEqual({
      bucket: "2026-08-01",
      services: 500_000,
      products: 120_000,
      gross_revenue: 620_000,
      discount: 20_000,
      net_revenue: 600_000,
      cogs: 210_000,
      gross_profit: 390_000,
      refunds: 0,
      net_income: 390_000,
    });
  });

  it("charges Monday's refund to Monday, leaving Saturday's sale untouched", async () => {
    // The refund undoes a Saturday shirt but was handed back on Monday, so
    // Monday's bar carries it. Saturday's profit is not restated.
    const report = await financial();

    expect(report.series[2]).toEqual({
      bucket: "2026-08-03",
      services: 300_000,
      products: 0,
      gross_revenue: 300_000,
      discount: 0,
      net_revenue: 300_000,
      cogs: 90_000,
      gross_profit: 210_000,
      refunds: 75_000,
      net_income: 135_000,
    });
    expect(report.series[0].net_income).toBe(390_000);
  });

  it("keeps takings Postgres filed outside the charted days off the chart", async () => {
    // A bucket label the range never enumerates. An ISO-week disagreement at
    // New Year is how this happens for real.
    answers.services.now = [
      ...answers.services.now,
      takings("2026-08-04", 999_000),
    ];

    const report = await financial();

    expect(report.series).toHaveLength(3);
    expect(report.series.reduce((sum, row) => sum + row.services, 0)).toBe(
      800_000
    );
  });
});

describe("the headline figures for the whole stretch", () => {
  it("adds the three days up into one set of totals", async () => {
    const report = await financial();

    expect(report.summary.current).toEqual({
      services_total: 800_000,
      products_total: 120_000,
      gross_revenue: 920_000,
      discount: 20_000,
      net_revenue: 900_000,
      cogs: 300_000,
      gross_profit: 600_000,
      refunds: 75_000,
      net_income: 525_000,
      net_margin: 525_000 / 900_000,
    });
  });

  it("reports no margin on a giveaway stretch instead of dividing by nothing", async () => {
    // Grand-opening weekend: everything charged was discounted away. A margin of
    // 0 beats NaN on the card.
    answers.services.now = [takings("2026-08-01", 100_000)];
    answers.products.now = [];
    answers.servicesCogs.now = [];
    answers.productsCogs.now = [];
    answers.discount.now = [takings("2026-08-01", 100_000)];
    answers.refunds.now = [];

    const report = await financial();

    expect(report.summary.current.net_revenue).toBe(0);
    expect(report.summary.current.net_margin).toBe(0);
  });

  it("adds a day's takings instead of stringing them together", async () => {
    // numeric(12,0) arrives as text. Left as text, Saturday's Rp500.000 of
    // laundry and Rp120.000 of soap would render as "500000120000".
    const report = await financial();

    expect(report.summary.current.gross_revenue).toBe(920_000);
    expect(typeof report.summary.current.gross_revenue).toBe("number");
  });
});

describe("this stretch against the one before it", () => {
  it("shows takings up but profit down after a big refund", async () => {
    // Rp920.000 charged against Rp800.000 the stretch before — but Rp75.000 went
    // back out, so the shop kept less. Both facts have to survive.
    const report = await financial();

    expect(report.previous).toEqual({ from: "2026-07-29", to: "2026-07-31" });
    expect(report.summary.deltas.gross_revenue).toEqual({
      current: 920_000,
      previous: 800_000,
      delta_pct: 0.15,
    });
    expect(report.summary.deltas.net_income).toEqual({
      current: 525_000,
      previous: 550_000,
      delta_pct: (525_000 - 550_000) / 550_000,
    });
  });

  it("leaves growth blank where the earlier stretch had none of that money", async () => {
    // No refunds and no discounts last stretch. Anything but blank claims an
    // infinite jump on the card.
    const report = await financial();

    expect(report.summary.deltas.refunds).toEqual({
      current: 75_000,
      previous: 0,
      delta_pct: null,
    });
    expect(report.summary.deltas.discount).toEqual({
      current: 20_000,
      previous: 0,
      delta_pct: null,
    });
  });
});

describe("splitting the takings between stores", () => {
  const store = (
    id: number,
    name: string,
    code: string,
    revenue: number,
    orders: number
  ) => [id, name, code, String(revenue), orders];

  it("gives each store its share of the takings, biggest first", async () => {
    answers.storeRevenue.now = [
      store(2, "Bintaro", "BIN", 300_000, 4),
      store(3, "Cipete", "CIP", 0, 0),
      store(1, "Kemang", "KEM", 600_000, 9),
    ];

    const report = await financial();

    expect(
      report.store_breakdown.map((row) => [row.store_name, row.share])
    ).toEqual([
      ["Kemang", 600_000 / 900_000],
      ["Bintaro", 300_000 / 900_000],
      ["Cipete", 0],
    ]);
  });

  it("gives a store no share of a stretch nobody banked anything", async () => {
    answers.storeRevenue.now = [store(1, "Kemang", "KEM", 0, 0)];

    const report = await financial();

    expect(report.store_breakdown[0].share).toBe(0);
  });
});

describe("which services earn the money", () => {
  it("charts the five biggest categories and lumps the rest into Other", async () => {
    // Seven categories on the price list, six bars on the chart: sepatu, karpet
    // and boneka are a rounding error next to cuci setrika.
    const priceList: [number, string, number][] = [
      [1, "Cuci Setrika", 400_000],
      [2, "Cuci Kering", 200_000],
      [3, "Setrika Saja", 100_000],
      [4, "Dry Clean", 50_000],
      [5, "Sepatu", 25_000],
      [6, "Karpet", 10_000],
      [7, "Boneka", 5000],
    ];
    answers.categoryRevenue.now = priceList.map(([id, name, revenue]) => [
      "2026-08-01",
      id,
      name,
      String(revenue),
    ]);

    const report = await financial();

    expect(report.category_keys).toEqual([
      { key: "cat_1", label: "Cuci Setrika" },
      { key: "cat_2", label: "Cuci Kering" },
      { key: "cat_3", label: "Setrika Saja" },
      { key: "cat_4", label: "Dry Clean" },
      { key: "cat_5", label: "Sepatu" },
      { key: "cat_other", label: "Other" },
    ]);
    expect(report.category_series[0]).toEqual({
      bucket: "2026-08-01",
      cat_1: 400_000,
      cat_2: 200_000,
      cat_3: 100_000,
      cat_4: 50_000,
      cat_5: 25_000,
      cat_other: 15_000,
    });
    // The treemap keeps every category, so the small ones stay auditable.
    expect(report.category_treemap).toHaveLength(7);
  });
});

describe("how the shop was paid", () => {
  it("splits the takings by tender and shares them out", async () => {
    answers.paymentMix.now = [
      ["2026-08-01", 1, "Cash", "400000", 5],
      ["2026-08-03", 1, "Cash", "200000", 3],
      ["2026-08-01", 2, "QRIS", "300000", 2],
    ];

    const report = await getPaymentMixReport({ from: FROM, to: TO });

    expect(report.summary.grand_total).toBe(900_000);
    expect(report.summary.total_orders).toBe(10);
    expect(
      report.summary.methods.map((m) => [m.payment_method_name, m.share])
    ).toEqual([
      ["Cash", 600_000 / 900_000],
      ["QRIS", 300_000 / 900_000],
    ]);
    expect(report.series).toEqual([
      { bucket: "2026-08-01", pm_1: 400_000, pm_2: 300_000 },
      { bucket: "2026-08-02", pm_1: 0, pm_2: 0 },
      { bucket: "2026-08-03", pm_1: 200_000, pm_2: 0 },
    ]);
  });
});

describe("what the shop handed back", () => {
  it("totals the refunds by reason and leaves untouched reasons at zero", async () => {
    answers.refundReasons.now = [
      ["2026-08-03", "damaged", "50000", 1],
      ["2026-08-03", "lost", "25000", 1],
    ];

    const report = await getRefundTrendReport({ from: FROM, to: TO });

    expect(report.summary.total_amount).toBe(75_000);
    expect(report.summary.total_refunds).toBe(1);
    expect(report.summary.reason_totals).toEqual({
      damaged: { amount: 50_000, items: 1 },
      lost: { amount: 25_000, items: 1 },
      cannot_process: { amount: 0, items: 0 },
      other: { amount: 0, items: 0 },
    });
    expect(report.reason_series[2]).toEqual({
      bucket: "2026-08-03",
      damaged: 50_000,
      lost: 25_000,
      cannot_process: 0,
      other: 0,
    });
    expect(report.reason_series[0]).toEqual({
      bucket: "2026-08-01",
      damaged: 0,
      lost: 0,
      cannot_process: 0,
      other: 0,
    });
  });
});

describe("asking one store for its takings", () => {
  const KEMANG = 3;
  const storeFilter = '"orders"."store_id" = $';

  // The gate on the route proves the reader was allowed to name Kemang. Nothing
  // between the gate and Postgres proved the report then *asked* for Kemang —
  // so a report can be scoped to one store and answer with the whole company.
  it("carries the store down into every figure it adds up", async () => {
    await getFinancialReport({ from: FROM, to: TO, store_id: KEMANG });

    const unscoped = sent.filter((query) => !query.sql.includes(storeFilter));

    // Store revenue is the one known exception, and by construction rather than
    // oversight: listStoreRevenueRows takes no store parameter, so the
    // store_breakdown panel is company-wide however the report was scoped.
    for (const query of unscoped) {
      expect(figureOf(query.sql)).toBe("storeRevenue");
    }
  });

  it("asks Postgres for the store that was named, not some other one", async () => {
    await getFinancialReport({ from: FROM, to: TO, store_id: KEMANG });

    for (const query of sent.filter((q) => q.sql.includes(storeFilter))) {
      expect(query.params).toContain(KEMANG);
    }
  });

  it("asks for every store when none was named", async () => {
    await getFinancialReport({ from: FROM, to: TO });

    for (const query of sent) {
      expect(query.sql).not.toContain(storeFilter);
    }
  });
});
