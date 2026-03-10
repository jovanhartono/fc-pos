import { z } from "zod";
import { campaignDiscountTypeEnum } from "@/db/schema";

const campaignStoreIdsSchema = z
  .array(z.coerce.number().int().positive())
  .default([]);

export const CampaignPayloadSchema = z.object({
  code: z.string().trim().min(1).max(32),
  discount_type: z.enum(campaignDiscountTypeEnum.enumValues),
  discount_value: z.string().trim().min(1),
  ends_at: z.coerce.date().nullish(),
  is_active: z.coerce.boolean().default(true),
  max_discount: z.string().trim().min(1).nullish(),
  min_order_total: z.string().trim().min(1).default("0"),
  name: z.string().trim().min(1).max(255),
  starts_at: z.coerce.date().nullish(),
  store_ids: campaignStoreIdsSchema,
});

export const GETCampaignsQuerySchema = z
  .object({
    is_active: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    store_id: z.coerce.number().int().positive().optional(),
  })
  .optional();

export type CampaignPayload = z.infer<typeof CampaignPayloadSchema>;
export type GetCampaignsQuery = z.infer<typeof GETCampaignsQuerySchema>;
