import { Hono } from "hono";
import { ForbiddenException } from "@/errors";
import { GETDashboardOverviewQuerySchema } from "@/modules/dashboard/dashboard.schema";
import {
  getDashboardCounts,
  getDashboardOverview,
} from "@/modules/dashboard/dashboard.service";
import type { JWTPayload } from "@/types";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

function assertAdmin(user: JWTPayload) {
  if (user.role !== "admin") {
    throw new ForbiddenException("Admin role required");
  }
}

const app = new Hono()
  .get("/counts", async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    assertAdmin(user);

    const counts = await getDashboardCounts();

    return c.json(success(counts));
  })
  .get(
    "/overview",
    zodValidator("query", GETDashboardOverviewQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      assertAdmin(user);

      const query = c.req.valid("query");
      const data = await getDashboardOverview(query);
      return c.json(success(data));
    }
  );

export default app;
