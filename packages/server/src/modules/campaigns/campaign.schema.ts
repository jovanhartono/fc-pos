import { z } from "zod";

const campaignStoreIdsSchema = z
  .array(z.coerce.number().int().positive())
  .default([]);

const campaignServiceIdsSchema = z.array(z.coerce.number().int().positive());

const campaignRedemptionModeSchema = z
  .enum(["listed", "code"])
  .default("listed");

const baseCampaignSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(255),
  ends_at: z.coerce.date().nullish(),
  is_active: z.coerce.boolean().default(true),
  min_order_total: z.string().trim().min(1).default("0"),
  starts_at: z.coerce.date().nullish(),
  store_ids: campaignStoreIdsSchema,
  redemption_mode: campaignRedemptionModeSchema,
  usage_limit: z.coerce.number().int().positive().nullish(),
  code_count: z.coerce.number().int().positive().nullish(),
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

export const CampaignPayloadSchema = z
  .discriminatedUnion("discount_type", [
    fixedCampaignSchema,
    percentageCampaignSchema,
    bogoCampaignSchema,
  ])
  .superRefine((data, ctx) => {
    if (data.redemption_mode === "code") {
      // A Voucher owns a batch of codes; the batch size is its cap, so a
      // separate usage_limit is redundant and disallowed (mutual exclusivity).
      if (data.code_count == null || data.code_count < 1) {
        ctx.addIssue({
          code: "custom",
          message: "code_count is required (min 1) for voucher campaigns",
          path: ["code_count"],
        });
      }
      if (data.usage_limit != null) {
        ctx.addIssue({
          code: "custom",
          message: "usage_limit is not allowed for voucher campaigns",
          path: ["usage_limit"],
        });
      }
      return;
    }

    // Listed campaigns never mint codes.
    if (data.code_count != null) {
      ctx.addIssue({
        code: "custom",
        message: "code_count is only allowed for voucher campaigns",
        path: ["code_count"],
      });
    }
  });

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
    // redemption_mode and code_count are immutable — a Voucher's mode and its
    // minted batch are fixed at creation; only the cap may change on listed.
    usage_limit: z.coerce.number().int().positive().nullable().optional(),
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
export type CampaignRedemptionMode = z.infer<
  typeof campaignRedemptionModeSchema
>;
