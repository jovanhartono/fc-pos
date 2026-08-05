import { z } from "zod";
import { dateStringSchema } from "@/schema/common";

// The store gate on the reports router reads store_id off the raw querystring,
// because per-route validators run after it. Both must read "which store" by
// the same rules, so there is one rule.
export const storeIdQuerySchema = z.coerce.number().int().positive();

export const GETDailyReportQuerySchema = z.object({
  date: dateStringSchema("date"),
  store_id: storeIdQuerySchema.optional(),
});

export type GetDailyReportQuery = z.infer<typeof GETDailyReportQuerySchema>;

export const GETReportOverviewQuerySchema = z.object({
  date: dateStringSchema("date"),
  store_id: storeIdQuerySchema.optional(),
  trend_days: z.coerce.number().int().min(1).max(60).default(14),
});

export type GetReportOverviewQuery = z.infer<
  typeof GETReportOverviewQuerySchema
>;

export const granularitySchema = z
  .enum(["day", "week", "month", "year"])
  .optional();
export type ReportGranularity = NonNullable<z.infer<typeof granularitySchema>>;

export const GETReportRangeQuerySchema = z
  .object({
    from: dateStringSchema("from"),
    to: dateStringSchema("to"),
    store_id: storeIdQuerySchema.optional(),
    granularity: granularitySchema,
  })
  .refine((value) => value.from <= value.to, {
    error: "from must be before or equal to to",
    path: ["from"],
  });

export type GetReportRangeQuery = z.infer<typeof GETReportRangeQuerySchema>;

export const GETAgingQueueQuerySchema = z.object({
  store_id: storeIdQuerySchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type GetAgingQueueQuery = z.infer<typeof GETAgingQueueQuerySchema>;

export interface KpiDelta<T = number> {
  current: T;
  delta_pct: number | null;
  previous: T;
}

export interface ComparableSummary<T> {
  current: T;
  deltas: { [K in keyof T]?: KpiDelta<T[K] extends number ? number : never> };
  previous: T;
}
