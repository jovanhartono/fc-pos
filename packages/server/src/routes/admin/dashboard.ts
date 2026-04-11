import { Hono } from "hono";
import { getDashboardCounts } from "@/modules/dashboard/dashboard.service";
import { success } from "@/utils/http";

const app = new Hono().get("/counts", async (c) => {
  const counts = await getDashboardCounts();

  return c.json(success(counts));
});

export default app;
