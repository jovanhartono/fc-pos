import z from "zod";
import { orderPaymentStatusEnum } from "@/db/schema";
import {
  CampaignPayloadSchema as _CampaignPayloadSchema,
  type CampaignRedemptionMode as _CampaignRedemptionMode,
  CampaignUpdatePayloadSchema as _CampaignUpdatePayloadSchema,
} from "@/modules/campaigns/campaign.schema";
import { POSTCategorySchema as _POSTCategorySchema } from "@/modules/categories/category.schema";
import {
  POSTCustomerSchema as _POSTCustomerSchema,
  PUTCustomerSchema as _PUTCustomerSchema,
} from "@/modules/customers/customer.schema";
import {
  POSTOrderPickupEventPresignSchema as _POSTOrderPickupEventPresignSchema,
  POSTOrderPickupEventSchema as _POSTOrderPickupEventSchema,
} from "@/modules/orders/order-admin.schema";
import {
  ORDER_SERVICE_TRANSITIONS as _ORDER_SERVICE_TRANSITIONS,
  ORDER_TERMINAL_SERVICE_STATUSES as _ORDER_TERMINAL_SERVICE_STATUSES,
} from "@/modules/orders/order-status-machine";
import { POSTPaymentMethodSchema as _POSTPaymentMethodSchema } from "@/modules/payment-methods/payment-method.schema";
import { POSTProductSchema as _POSTProductSchema } from "@/modules/products/product.schema";
import { POSTServiceSchema as _POSTServiceSchema } from "@/modules/services/service.schema";
import { POSTStoreSchema as _POSTStoreSchema } from "@/modules/stores/store.schema";

export const ORDER_SERVICE_TRANSITIONS = _ORDER_SERVICE_TRANSITIONS;
export const ORDER_TERMINAL_SERVICE_STATUSES = _ORDER_TERMINAL_SERVICE_STATUSES;
export const POSTOrderPickupEventPresignSchema =
  _POSTOrderPickupEventPresignSchema;
export const POSTOrderPickupEventSchema = _POSTOrderPickupEventSchema;
export const CampaignPayloadSchema = _CampaignPayloadSchema;
export const CampaignUpdatePayloadSchema = _CampaignUpdatePayloadSchema;
export type CampaignRedemptionMode = _CampaignRedemptionMode;
export const POSTCustomerSchema = _POSTCustomerSchema;
export const PUTCustomerSchema = _PUTCustomerSchema;
export const POSTCategorySchema = _POSTCategorySchema;
export const POSTPaymentMethodSchema = _POSTPaymentMethodSchema;
export const POSTProductSchema = _POSTProductSchema;
export const POSTServiceSchema = _POSTServiceSchema;
export const POSTStoreSchema = _POSTStoreSchema;

import {
  type CampaignContribution as _CampaignContribution,
  type CampaignDiscountInput as _CampaignDiscountInput,
  computeCampaignContribution as _computeCampaignContribution,
  type DiscountLine as _DiscountLine,
  type StackedDiscount as _StackedDiscount,
  stackCampaignDiscounts as _stackCampaignDiscounts,
} from "@/schema/discount";

export type CampaignContribution<T extends _CampaignDiscountInput> =
  _CampaignContribution<T>;
export type CampaignDiscountInput = _CampaignDiscountInput;
export type DiscountLine = _DiscountLine;
export type StackedDiscount<T extends _CampaignDiscountInput> =
  _StackedDiscount<T>;
export const computeCampaignContribution = _computeCampaignContribution;
export const stackCampaignDiscounts = _stackCampaignDiscounts;

import {
  type CampaignEligibilityContext as _CampaignEligibilityContext,
  type CampaignEligibilityInput as _CampaignEligibilityInput,
  campaignIneligibilityReason as _campaignIneligibilityReason,
} from "@/schema/campaign-eligibility";

export type CampaignEligibilityContext = _CampaignEligibilityContext;
export type CampaignEligibilityInput = _CampaignEligibilityInput;
export const campaignIneligibilityReason = _campaignIneligibilityReason;

import {
  currencySchema,
  isActiveSchema,
  optionalVarcharSchema,
  phoneSchema,
  varcharSchema,
} from "@/schema/common";

const userSchema = z.object({
  username: z
    .string("Minimum 5 characters")
    .trim()
    .min(5, "Minimum 5 characters"),
  name: z.string("Name is required").trim().min(1, "Name is required"),
  password: z
    .string("Minimum 8 characters")
    .trim()
    .min(8, "Minimum 8 characters"),
  confirm_password: z
    .string("Minimum 8 characters")
    .trim()
    .min(8, "Minimum 8 characters"),
  role: z.literal(
    ["admin", "cashier", "worker", "courier"],
    "Role is required"
  ),
  is_active: isActiveSchema,
  can_process_pickup: z.boolean().default(false),
});

export const POSTUserSchema = userSchema.refine(
  (data) => data.password === data.confirm_password,
  {
    error: "Password does not match",
    path: ["confirm_password"],
    when: (payload) =>
      userSchema
        .pick({ password: true, confirm_password: true })
        .safeParse(payload.value).success,
  }
);

export const PUTUserSchema = userSchema.omit({
  password: true,
  confirm_password: true,
});

export const POSTOrderSchema = z
  .object({
    // POS sends the typed customer; the server find-or-creates by phone inside
    // the Order transaction (no client-resolved id). See ADR-0011.
    customer: z.object({
      name: varcharSchema("Name"),
      phone_number: phoneSchema,
    }),
    store_id: z.number("Store ID is required"),
    campaign_ids: z
      .array(z.number().int().positive())
      .default([])
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Duplicate campaign IDs are not allowed"
      ),
    // Bearer voucher codes. Normalized to uppercase per element so the whole
    // downstream (service claim, repo lookup) receives already-canonical codes.
    voucher_codes: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(32)
          .transform((code) => code.toUpperCase())
      )
      .default([])
      .refine(
        (codes) => new Set(codes).size === codes.length,
        "Duplicate voucher codes are not allowed"
      ),
    products: z
      .array(
        z.object(
          {
            id: z.number("Product is required"),
            qty: z.int().positive("Quantity must be positive"),
          },
          "Product is required"
        )
      )
      .optional(),
    services: z
      .array(
        z.object(
          {
            id: z.number("Service is required"),
            is_priority: z.boolean().optional(),
            notes: z.string().optional(),
            brand: optionalVarcharSchema("Brand"),
            color: optionalVarcharSchema("Item Color"),
            model: optionalVarcharSchema("Model"),
            size: optionalVarcharSchema("Size", 64),
          },
          "Service is required"
        )
      )
      .optional(),
    discount: currencySchema("Discount").default("0"),
    payment_method_id: z.number().optional(),
    payment_status: z.enum(
      orderPaymentStatusEnum.enumValues,
      "Payment status is required"
    ),
    notes: z.string().trim().optional(),
    collected_by: z.number().int().positive().optional(),
  })
  .refine(
    (val) => {
      const hasAtLeastOneItem = !!(
        val.products?.length || val.services?.length
      );
      return hasAtLeastOneItem;
    },
    {
      error: "Product or Service is required",
      path: ["products_ids", "services_ids"],
    }
  )
  .refine(
    (val) =>
      val.payment_status !== "paid" || val.payment_method_id !== undefined,
    {
      error: "Payment method is required for paid orders",
      path: ["payment_method_id"],
    }
  );
