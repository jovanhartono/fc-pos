import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { BadRequestException } from "@/http-exceptions";
import { assertIsAdmin } from "@/modules/permissions/permissions";
import {
  GETAgingQueueQuerySchema,
  GETReportOverviewQuerySchema,
  GETReportRangeQuerySchema,
  storeIdQuerySchema,
} from "@/modules/reports/report.schema";
import {
  getAgingQueueReport,
  getReportOverview,
} from "@/modules/reports/report.service";
import {
  getCampaignEffectivenessReport,
  getCustomerAcquisitionReport,
  getFinancialReport,
  getOrdersFlowReport,
  getPaymentMixReport,
  getRefundTrendReport,
  getWorkerProductivityReport,
} from "@/modules/reports/report-range.service";
import type { AdminEnv } from "@/types/hono";
import { assertStoreAccess } from "@/utils/authorization";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

// Admin-only today, and assertStoreAccess waves admins through, so this gate
// refuses nobody yet. It also only covers requests that *name* a store — leaving
// store_id off still answers for the whole company, so opening reports to shop
// staff needs resolveStoreScope in the services too. One gate for the router,
// because the way that leaks is a tenth report whose author forgot the check.
// store_id comes off the raw querystring, since per-route validators run after
// this, so it parses with the schema they use or the request is refused.
const requireStoreAccess = createMiddleware<AdminEnv>(async (c, next) => {
  const raw = c.req.query("store_id");

  if (raw !== undefined) {
    const storeId = storeIdQuerySchema.safeParse(raw);

    if (!storeId.success) {
      throw new BadRequestException("store_id must be a positive whole number");
    }

    await assertStoreAccess(c.get("jwtPayload"), storeId.data);
  }

  await next();
});

const app = new Hono<AdminEnv>()
  .use(async (c, next) => {
    assertIsAdmin(c.get("jwtPayload"));
    await next();
  })
  .use(requireStoreAccess)
  .get(
    "/overview",
    zodValidator("query", GETReportOverviewQuerySchema),
    async (c) => {
      const data = await getReportOverview(c.req.valid("query"));
      return c.json(success(data));
    }
  )
  .get(
    "/financial",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const data = await getFinancialReport(c.req.valid("query"));
      return c.json(success(data));
    }
  )
  .get(
    "/orders-flow",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const data = await getOrdersFlowReport(c.req.valid("query"));
      return c.json(success(data));
    }
  )
  .get(
    "/payment-mix",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const data = await getPaymentMixReport(c.req.valid("query"));
      return c.json(success(data));
    }
  )
  .get(
    "/customer-acquisition",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const data = await getCustomerAcquisitionReport(c.req.valid("query"));
      return c.json(success(data));
    }
  )
  .get(
    "/refund-trend",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const data = await getRefundTrendReport(c.req.valid("query"));
      return c.json(success(data));
    }
  )
  .get(
    "/worker-productivity",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const data = await getWorkerProductivityReport(c.req.valid("query"));
      return c.json(success(data));
    }
  )
  .get(
    "/campaign-effectiveness",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const data = await getCampaignEffectivenessReport(c.req.valid("query"));
      return c.json(success(data));
    }
  )
  .get(
    "/aging-queue",
    zodValidator("query", GETAgingQueueQuerySchema),
    async (c) => {
      const result = await getAgingQueueReport(c.req.valid("query"));
      return c.json(success(result.items, undefined, result.meta));
    }
  );

export default app;
