import { z } from "zod";

export const GETDashboardOverviewQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
});

export type GetDashboardOverviewQuery = z.infer<
  typeof GETDashboardOverviewQuerySchema
>;
