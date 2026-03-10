import { z } from "zod";
import { orderServicePhotoTypeEnum, orderServiceStatusEnum } from "@/db/schema";
import { zodValidator } from "@/utils/zod-validator-wrapper";

export const ORDER_STATUS_TRANSITIONS: Record<
  (typeof orderServiceStatusEnum.enumValues)[number],
  (typeof orderServiceStatusEnum.enumValues)[number][]
> = {
  received: ["queued", "cancelled"],
  queued: ["processing", "cancelled"],
  processing: ["quality_check", "cancelled"],
  quality_check: ["processing", "ready_for_pickup", "cancelled"],
  ready_for_pickup: ["picked_up", "refunded", "cancelled"],
  picked_up: [],
  refunded: [],
  cancelled: [],
};

export const orderServiceParamSchema = zodValidator(
  "param",
  z.object({
    id: z.coerce.number().int().positive(),
    serviceId: z.coerce.number().int().positive(),
  })
);

export const POSTOrderServicePhotoPresignSchema = z.object({
  content_type: z
    .string()
    .trim()
    .refine(
      (value) =>
        ["image/jpeg", "image/png", "image/webp", "image/heic"].includes(value),
      "Unsupported content type"
    ),
  photo_type: z.enum(orderServicePhotoTypeEnum.enumValues),
});

export const POSTOrderServicePhotoSchema = z.object({
  photo_type: z.enum(orderServicePhotoTypeEnum.enumValues),
  s3_key: z.string().trim().min(1).max(512),
});

export const PATCHOrderServiceStatusSchema = z.object({
  note: z.string().trim().optional(),
  status: z.enum(orderServiceStatusEnum.enumValues),
});

export const PATCHOrderServiceHandlerSchema = z.object({
  handler_id: z.coerce.number().int().positive().nullable(),
  note: z.string().trim().optional(),
});

export const PATCHOrderPaymentSchema = z.object({
  payment_method_id: z.coerce.number().int().positive(),
});

export const POSTOrderRefundSchema = z.object({
  items: z
    .array(
      z
        .object({
          note: z.string().trim().optional(),
          order_service_id: z.coerce.number().int().positive(),
          reason: z.enum(["damaged", "cannot_process", "lost", "other"]),
        })
        .superRefine((value, ctx) => {
          if (value.reason === "other" && !value.note?.trim()) {
            ctx.addIssue({
              code: "custom",
              message: "Reason note is required when reason is 'other'",
              path: ["note"],
            });
          }
        })
    )
    .min(1),
  note: z.string().trim().optional(),
});

export const GETOrderByItemCodeQuerySchema = z.object({
  item_code: z.string().trim().min(1).max(64),
});

export const GETMyOrderServicesQuerySchema = z.object({
  store_id: z.coerce.number().int().positive().optional(),
  include_terminal: z.coerce.boolean().optional().default(false),
});

export type GetMyOrderServicesQuery = z.infer<
  typeof GETMyOrderServicesQuerySchema
>;
export type PatchOrderServiceStatusInput = z.infer<
  typeof PATCHOrderServiceStatusSchema
>;
export type PostOrderServicePhotoInput = z.infer<
  typeof POSTOrderServicePhotoSchema
>;
export type PostOrderServicePhotoPresignInput = z.infer<
  typeof POSTOrderServicePhotoPresignSchema
>;
export type PostOrderRefundInput = z.infer<typeof POSTOrderRefundSchema>;
export type PatchOrderServiceHandlerInput = z.infer<
  typeof PATCHOrderServiceHandlerSchema
>;
export type PatchOrderPaymentInput = z.infer<typeof PATCHOrderPaymentSchema>;
