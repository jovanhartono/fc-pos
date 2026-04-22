import { Hono } from "hono";
import { ForbiddenException } from "@/errors";
import {
  GETDailyReportQuerySchema,
  GETReportOverviewQuerySchema,
  GETReportRangeQuerySchema,
} from "@/modules/reports/report.schema";
import {
  getDailyReport,
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
import type { JWTPayload } from "@/types";
import { assertStoreAccess } from "@/utils/authorization";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

function assertAdmin(user: JWTPayload) {
  if (user.role !== "admin") {
    throw new ForbiddenException("Admin role required");
  }
}

const app = new Hono()
  .get(
    "/daily",
    zodValidator("query", GETDailyReportQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      assertAdmin(user);

      const query = c.req.valid("query");
      if (query.store_id !== undefined) {
        await assertStoreAccess(user, query.store_id);
      }

      const data = await getDailyReport(query);
      return c.json(success(data));
    }
  )
  .get(
    "/overview",
    zodValidator("query", GETReportOverviewQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      assertAdmin(user);

      const query = c.req.valid("query");
      if (query.store_id !== undefined) {
        await assertStoreAccess(user, query.store_id);
      }

      const data = await getReportOverview(query);
      return c.json(success(data));
    }
  )
  .get(
    "/financial",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      assertAdmin(user);
      const query = c.req.valid("query");
      if (query.store_id !== undefined) {
        await assertStoreAccess(user, query.store_id);
      }
      const data = await getFinancialReport(query);
      return c.json(success(data));
    }
  )
  .get(
    "/orders-flow",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      assertAdmin(user);
      const query = c.req.valid("query");
      if (query.store_id !== undefined) {
        await assertStoreAccess(user, query.store_id);
      }
      const data = await getOrdersFlowReport(query);
      return c.json(success(data));
    }
  )
  .get(
    "/payment-mix",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      assertAdmin(user);
      const query = c.req.valid("query");
      if (query.store_id !== undefined) {
        await assertStoreAccess(user, query.store_id);
      }
      const data = await getPaymentMixReport(query);
      return c.json(success(data));
    }
  )
  .get(
    "/customer-acquisition",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      assertAdmin(user);
      const query = c.req.valid("query");
      if (query.store_id !== undefined) {
        await assertStoreAccess(user, query.store_id);
      }
      const data = await getCustomerAcquisitionReport(query);
      return c.json(success(data));
    }
  )
  .get(
    "/refund-trend",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      assertAdmin(user);
      const query = c.req.valid("query");
      if (query.store_id !== undefined) {
        await assertStoreAccess(user, query.store_id);
      }
      const data = await getRefundTrendReport(query);
      return c.json(success(data));
    }
  )
  .get(
    "/worker-productivity",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      assertAdmin(user);
      const query = c.req.valid("query");
      if (query.store_id !== undefined) {
        await assertStoreAccess(user, query.store_id);
      }
      const data = await getWorkerProductivityReport(query);
      return c.json(success(data));
    }
  )
  .get(
    "/campaign-effectiveness",
    zodValidator("query", GETReportRangeQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      assertAdmin(user);
      const query = c.req.valid("query");
      if (query.store_id !== undefined) {
        await assertStoreAccess(user, query.store_id);
      }
      const data = await getCampaignEffectivenessReport(query);
      return c.json(success(data));
    }
  );

export default app;
