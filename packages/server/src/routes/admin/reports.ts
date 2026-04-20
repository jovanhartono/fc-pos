import { Hono } from "hono";
import { ForbiddenException } from "@/errors";
import {
  GETDailyReportQuerySchema,
  GETReportOverviewQuerySchema,
} from "@/modules/reports/report.schema";
import {
  getDailyReport,
  getReportOverview,
} from "@/modules/reports/report.service";
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
  );

export default app;
