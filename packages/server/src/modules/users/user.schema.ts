import { z } from "zod";
import { userRoleEnum } from "@/db/schema";
import { photoContentTypeSchema } from "@/schema/common";

export const PUTUserStoresSchema = z.object({
  store_ids: z.array(z.coerce.number().int().positive()),
});

export const GETUsersQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    is_active: z.stringbool().optional(),
    role: z.enum(userRoleEnum.enumValues).optional(),
  })
  .optional();

export type GetUsersQuery = z.infer<typeof GETUsersQuerySchema>;

export const POSTAvatarPresignSchema = z.object({
  content_type: photoContentTypeSchema,
});

export const PUTAvatarSchema = z.object({
  image_path: z.string().trim().min(1).max(512),
});

export const PERFORMANCE_PERIODS = [
  "last_7_days",
  "this_month",
  "last_month",
] as const;

export const GETPerformanceQuerySchema = z.object({
  period: z.enum(PERFORMANCE_PERIODS),
});

export type PerformancePeriod = (typeof PERFORMANCE_PERIODS)[number];
