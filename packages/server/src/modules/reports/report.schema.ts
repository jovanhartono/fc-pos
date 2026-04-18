import { z } from "zod";
import { dateStringSchema } from "@/schema/common";

export const GETDailyReportQuerySchema = z.object({
  date: dateStringSchema("date"),
  store_id: z.coerce.number().int().positive().optional(),
});

export type GetDailyReportQuery = z.infer<typeof GETDailyReportQuerySchema>;
