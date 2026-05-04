import { z } from "zod";

const campaignStoreIdsSchema = z
  .array(z.coerce.number().int().positive())
  .default([]);

const campaignServiceIdsSchema = z.array(z.coerce.number().int().positive());

const baseCampaignSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(255),
  ends_at: z.coerce.date().nullish(),
  is_active: z.coerce.boolean().default(true),
  min_order_total: z.string().trim().min(1).default("0"),
  starts_at: z.coerce.date().nullish(),
  store_ids: campaignStoreIdsSchema,
});

const fixedCampaignSchema = baseCampaignSchema.extend({
  discount_type: z.literal("fixed"),
  discount_value: z.string().trim().min(1),
  max_discount: z.string().trim().min(1).nullish(),
  eligible_service_ids: campaignServiceIdsSchema.default([]),
});

const percentageCampaignSchema = baseCampaignSchema.extend({
  discount_type: z.literal("percentage"),
  discount_value: z.string().trim().min(1),
  max_discount: z.string().trim().min(1).nullish(),
  eligible_service_ids: campaignServiceIdsSchema.default([]),
});

const bogoCampaignSchema = baseCampaignSchema.extend({
  discount_type: z.literal("buy_n_get_m_free"),
  discount_value: z.string().trim().default("0"),
  max_discount: z.string().trim().nullish().default(null),
  buy_quantity: z.coerce.number().int().min(1),
  free_quantity: z.coerce.number().int().min(1),
  eligible_service_ids: campaignServiceIdsSchema.min(
    1,
    "Eligible services required for buy N get M free"
  ),
});

export const CampaignPayloadSchema = z.discriminatedUnion("discount_type", [
  fixedCampaignSchema,
  percentageCampaignSchema,
  bogoCampaignSchema,
]);

export const CampaignUpdatePayloadSchema = z
  .object({
    code: z.string().trim().min(1).max(32).optional(),
    name: z.string().trim().min(1).max(255).optional(),
    discount_type: z
      .enum(["fixed", "percentage", "buy_n_get_m_free"])
      .optional(),
    discount_value: z.string().trim().optional(),
    max_discount: z.string().trim().nullable().optional(),
    min_order_total: z.string().trim().min(1).optional(),
    starts_at: z.coerce.date().nullable().optional(),
    ends_at: z.coerce.date().nullable().optional(),
    is_active: z.coerce.boolean().optional(),
    store_ids: z.array(z.coerce.number().int().positive()).optional(),
    eligible_service_ids: z
      .array(z.coerce.number().int().positive())
      .optional(),
    buy_quantity: z.coerce.number().int().min(1).nullable().optional(),
    free_quantity: z.coerce.number().int().min(1).nullable().optional(),
  })
  .strict();

export const GETCampaignsQuerySchema = z
  .object({
    is_active: z.stringbool().optional(),
    store_id: z.coerce.number().int().positive().optional(),
  })
  .optional();

export type CampaignPayload = z.infer<typeof CampaignPayloadSchema>;
export type CampaignUpdatePayload = z.infer<typeof CampaignUpdatePayloadSchema>;
export type GetCampaignsQuery = z.infer<typeof GETCampaignsQuerySchema>;
