import { z } from "zod";
import { orderServiceStatusEnum } from "@/db/schema";
import { MAX_PAGE_SIZE } from "@/modules/orders/order.schema";
import { dateStringSchema } from "@/schema/common";
import { normalizePagination } from "@/utils/pagination";
import { zodValidator } from "@/utils/zod-validator-wrapper";

export const ORDER_STATUS_TRANSITIONS: Record<
  (typeof orderServiceStatusEnum.enumValues)[number],
  (typeof orderServiceStatusEnum.enumValues)[number][]
> = {
  queued: ["processing", "cancelled"],
  processing: ["quality_check", "cancelled"],
  quality_check: ["processing", "ready_for_pickup", "cancelled"],
  ready_for_pickup: ["refunded", "cancelled"],
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

const photoContentTypeSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      ["image/jpeg", "image/png", "image/webp", "image/heic"].includes(value),
    "Unsupported content type"
  );

export const POSTOrderServicePhotoPresignSchema = z.object({
  content_type: photoContentTypeSchema,
});

export const POSTOrderDropoffPhotoPresignSchema = z.object({
  content_type: photoContentTypeSchema,
});

export const POSTOrderPickupEventPresignSchema = z.object({
  content_type: photoContentTypeSchema,
});

export const POSTOrderServicePhotoSchema = z.object({
  image_path: z.string().trim().min(1).max(512),
  note: z.string().trim().max(1000).optional(),
});

export const PUTOrderDropoffPhotoSchema = z.object({
  image_path: z.string().trim().min(1).max(512),
});

export const POSTOrderPickupEventSchema = z.object({
  image_path: z.string().trim().min(1).max(512),
  service_ids: z.array(z.coerce.number().int().positive()).min(1),
});

export const PATCHOrderServiceStatusSchema = z
  .object({
    cancel_reason: z.string().trim().max(1000).optional(),
    note: z.string().trim().optional(),
    status: z.enum(orderServiceStatusEnum.enumValues),
  })
  .superRefine((value, ctx) => {
    if (value.status === "cancelled" && !value.cancel_reason?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Cancel reason is required when cancelling a service",
        path: ["cancel_reason"],
      });
    }
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

export const GETOrderServiceByIdQuerySchema = z.object({
  service_id: z.coerce.number().int().positive(),
});

export const GETMyOrderServicesQuerySchema = z.object({
  store_id: z.coerce.number().int().positive().optional(),
  include_terminal: z.stringbool().optional().default(false),
});

export const GETOrderServiceQueueQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    store_id: z.coerce.number().int().positive().optional(),
    search: z.string().trim().min(1).max(100).optional(),
    status: z.enum(orderServiceStatusEnum.enumValues).optional(),
    date_from: dateStringSchema("date_from").optional(),
    date_to: dateStringSchema("date_to").optional(),
  })
  .refine(
    (query) =>
      !(query.date_from && query.date_to) || query.date_from <= query.date_to,
    {
      error: "date_from must be less than or equal to date_to",
      path: ["date_from"],
    }
  );

export type GetMyOrderServicesQuery = z.infer<
  typeof GETMyOrderServicesQuerySchema
>;
export type GetOrderServiceQueueQuery = z.infer<
  typeof GETOrderServiceQueueQuerySchema
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
export type PostOrderDropoffPhotoPresignInput = z.infer<
  typeof POSTOrderDropoffPhotoPresignSchema
>;
export type PostOrderRefundInput = z.infer<typeof POSTOrderRefundSchema>;
export type PatchOrderServiceHandlerInput = z.infer<
  typeof PATCHOrderServiceHandlerSchema
>;
export type PatchOrderPaymentInput = z.infer<typeof PATCHOrderPaymentSchema>;
export type PutOrderDropoffPhotoInput = z.infer<
  typeof PUTOrderDropoffPhotoSchema
>;
export type PostOrderPickupEventPresignInput = z.infer<
  typeof POSTOrderPickupEventPresignSchema
>;
export type PostOrderPickupEventInput = z.infer<
  typeof POSTOrderPickupEventSchema
>;

export function normalizeOrderServiceQueueQuery(
  query?: GetOrderServiceQueueQuery
) {
  const pagination = normalizePagination(query, {
    maxPageSize: MAX_PAGE_SIZE,
  });

  return {
    limit: pagination.limit,
    offset: pagination.offset,
    store_id: query?.store_id,
    search: query?.search,
    status: query?.status,
    date_from: query?.date_from,
    date_to: query?.date_to,
  };
}
