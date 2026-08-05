import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { ForbiddenException } from "@/http-exceptions";
import type { JWTPayload } from "@/types";
import { errorHandler } from "@/utils/error-handler";

// Every report service and the store gate are both replaced below, so nothing
// in this router's graph ever reaches db — it only has to exist to be imported.
mock.module("@/db", () => ({ db: {} }));

const KEMANG = 1;
const BINTARO = 2;

const gateCalls: { storeId: number; userId: number }[] = [];

// Stands in for the store gate having answered "no". The real one waves an
// admin through, so a suite run as admin would never see a refusal — but the
// question here is what the reports router does when the gate refuses, not who
// the gate refuses. That decision is pinned in utils/authorization.test.ts.
mock.module("@/utils/authorization", () => ({
  assertStoreAccess: (user: JWTPayload, storeId: number) => {
    gateCalls.push({ storeId, userId: user.id });

    if (storeId !== KEMANG) {
      throw new ForbiddenException("You do not have access to this store");
    }

    return Promise.resolve();
  },
}));

// Each report is stubbed to a marker that records the store it was told to
// report on, so a test can compare what the gate checked against what the report
// would actually have been run for.
const produced: { report: string; storeId?: number }[] = [];

const marker =
  (report: string) =>
  (query: { store_id?: number } = {}) => {
    produced.push({ report, storeId: query.store_id });
    return Promise.resolve({ ok: report });
  };

mock.module("@/modules/reports/report.service", () => ({
  getAgingQueueReport: (query: { store_id?: number } = {}) => {
    produced.push({ report: "aging-queue", storeId: query.store_id });
    return Promise.resolve({ items: [], meta: {} });
  },
  getReportOverview: marker("overview"),
}));

mock.module("@/modules/reports/report-range.service", () => ({
  getCampaignEffectivenessReport: marker("campaign-effectiveness"),
  getCustomerAcquisitionReport: marker("customer-acquisition"),
  getFinancialReport: marker("financial"),
  getOrdersFlowReport: marker("orders-flow"),
  getPaymentMixReport: marker("payment-mix"),
  getRefundTrendReport: marker("refund-trend"),
  getWorkerProductivityReport: marker("worker-productivity"),
}));

const reportsRoutes = (await import("@/routes/admin/reports")).default;

const owner: JWTPayload = {
  id: 11,
  name: "Bu Sri",
  username: "sri",
  role: "admin",
  can_process_pickup: false,
};

const app = new Hono<{ Variables: { jwtPayload: JWTPayload } }>()
  .use("*", async (c, next) => {
    c.set("jwtPayload", owner);
    await next();
  })
  .route("/reports", reportsRoutes);

app.onError(errorHandler);

// Every report is dated except the aging queue, which asks what is still on the
// rack right now.
const REPORTS = [
  { path: "/overview", params: "date=2026-08-05" },
  { path: "/financial", params: "from=2026-08-01&to=2026-08-05" },
  { path: "/orders-flow", params: "from=2026-08-01&to=2026-08-05" },
  { path: "/payment-mix", params: "from=2026-08-01&to=2026-08-05" },
  { path: "/customer-acquisition", params: "from=2026-08-01&to=2026-08-05" },
  { path: "/refund-trend", params: "from=2026-08-01&to=2026-08-05" },
  { path: "/worker-productivity", params: "from=2026-08-01&to=2026-08-05" },
  { path: "/campaign-effectiveness", params: "from=2026-08-01&to=2026-08-05" },
  { path: "/aging-queue", params: "" },
];

const call = (path: string, params: string) =>
  app.request(`/reports${path}${params ? `?${params}` : ""}`);

const withStore = (params: string, storeId: string) =>
  params ? `${params}&store_id=${storeId}` : `store_id=${storeId}`;

beforeEach(() => {
  gateCalls.length = 0;
  produced.length = 0;
});

describe("naming a store on a report is checked against the store", () => {
  for (const { path, params } of REPORTS) {
    it(`checks the store before running ${path}`, async () => {
      const res = await call(path, withStore(params, String(KEMANG)));

      expect(res.status).toBe(200);
      expect(gateCalls).toEqual([{ storeId: KEMANG, userId: 11 }]);
    });

    it(`refuses ${path} for a store that is not theirs`, async () => {
      const res = await call(path, withStore(params, String(BINTARO)));

      expect(res.status).toBe(403);
      expect(produced).toEqual([]);
    });
  }
});

describe("a store dressed up to look like another", () => {
  // The report reads the store after coercion, so store_id=+1 and store_id=%201
  // both report on Kemang. A gate that recognised only plain digits would wave
  // these past and hand Kemang's takings to whoever asked.
  const disguises = ["+1", "%201", "1.0", "1e0", "01", "1%20"];

  for (const disguise of disguises) {
    it(`checks the store for store_id=${disguise}`, async () => {
      const res = await call(
        "/financial",
        withStore("from=2026-08-01&to=2026-08-05", disguise)
      );

      expect(res.status).toBe(200);
      expect(gateCalls).toEqual([{ storeId: KEMANG, userId: 11 }]);
      expect(produced).toEqual([{ report: "financial", storeId: KEMANG }]);
    });
  }
});

describe("a store the gate cannot read", () => {
  // A store it cannot read is refused, not dropped: running the report with no
  // store filter would answer with every store's takings.
  const unreadable = ["0", "-1", "abc", "", "1.5", "9999999999999999999999"];

  for (const value of unreadable) {
    it(`refuses store_id=${value} before any report is produced`, async () => {
      const res = await call(
        "/financial",
        withStore("from=2026-08-01&to=2026-08-05", value)
      );

      expect(res.status).toBe(400);
      expect(produced).toEqual([]);
    });
  }

  it("refuses a store named twice rather than picking one", async () => {
    const res = await app.request("/reports/aging-queue?store_id=1&store_id=2");

    expect(res.status).toBe(400);
    expect(produced).toEqual([]);
  });
});

describe("what the gate covers and what it leaves alone", () => {
  it("gates a report path nobody has written yet", async () => {
    // The gate hangs off the router, not off each report, so the tenth report
    // added here is checked before its author writes a line.
    const res = await call("/not-a-report-yet", "store_id=2");

    expect(res.status).toBe(403);
    expect(gateCalls).toEqual([{ storeId: BINTARO, userId: 11 }]);
  });

  it("refuses an unreadable store on a report path nobody has written yet", async () => {
    const res = await call("/not-a-report-yet", "store_id=abc");

    expect(res.status).toBe(400);
  });

  it("does not ask which store a company-wide report belongs to", async () => {
    const res = await call("/financial", "from=2026-08-01&to=2026-08-05");

    expect(res.status).toBe(200);
    expect(gateCalls).toEqual([]);
    expect(produced).toEqual([{ report: "financial", storeId: undefined }]);
  });
});
