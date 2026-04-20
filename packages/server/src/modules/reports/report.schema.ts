import { z } from "zod";
import { dateStringSchema } from "@/schema/common";

export const GETDailyReportQuerySchema = z.object({
  date: dateStringSchema("date"),
  store_id: z.coerce.number().int().positive().optional(),
});

export type GetDailyReportQuery = z.infer<typeof GETDailyReportQuerySchema>;

export const GETReportOverviewQuerySchema = z.object({
  date: dateStringSchema("date"),
  store_id: z.coerce.number().int().positive().optional(),
  trend_days: z.coerce.number().int().min(1).max(60).default(14),
});

export type GetReportOverviewQuery = z.infer<
  typeof GETReportOverviewQuerySchema
>;
