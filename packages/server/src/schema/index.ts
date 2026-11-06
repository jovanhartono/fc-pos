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
import { POSTPaymentMethodSchema as _POSTPaymentMethodSchema } from "@/modules/payment-methods/payment-method.schema";
import { GATEWAY_LABELS as _GATEWAY_LABELS } from "@/modules/payments/gateways/types";
import { POSTProductSchema as _POSTProductSchema } from "@/modules/products/product.schema";
import { POSTServiceSchema as _POSTServiceSchema } from "@/modules/services/service.schema";
import { POSTStoreSchema as _POSTStoreSchema } from "@/modules/stores/store.schema";
import { POSTStoreDeviceSchema as _POSTStoreDeviceSchema } from "@/modules/stores/store-device.schema";

// The web's form schemas. The rules both sides run live in ./rules, which
// stays free of zod and the tables.
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
export const GATEWAY_LABELS = _GATEWAY_LABELS;
export const POSTProductSchema = _POSTProductSchema;
export const POSTServiceSchema = _POSTServiceSchema;
export const POSTStoreSchema = _POSTStoreSchema;
export const POSTStoreDeviceSchema = _POSTStoreDeviceSchema;

import {
  campaignIdsSchema,
  currencySchema,
  isActiveSchema,
  optionalVarcharSchema,
  phoneSchema,
  varcharSchema,
  voucherCodesSchema,
} from "@/schema/common";

import {
  isValidPhoneNumber as _isValidPhoneNumber,
  normalizePhoneNumber as _normalizePhoneNumber,
} from "@/schema/phone";

// The phone parser stays here with the forms rather than in ./rules. Given its
// own entry, it split the app's first download into dozens of small files.
export const isValidPhoneNumber = _isValidPhoneNumber;
export const normalizePhoneNumber = _normalizePhoneNumber;

const passwordPairSchema = z.object({
  password: z
    .string("Minimum 8 characters")
    .trim()
    .min(8, "Minimum 8 characters"),
  confirm_password: z
    .string("Minimum 8 characters")
    .trim()
    .min(8, "Minimum 8 characters"),
});

const matchesConfirmation = (data: {
  password: string;
  confirm_password: string;
}) => data.password === data.confirm_password;

const confirmationMismatch = {
  error: "Password does not match",
  path: ["confirm_password"],
  when: (payload: { value: unknown }) =>
    passwordPairSchema.safeParse(payload.value).success,
};

const userSchema = z.object({
  username: z
    .string("Minimum 5 characters")
    .trim()
    .min(5, "Minimum 5 characters"),
  name: z.string("Name is required").trim().min(1, "Name is required"),
  ...passwordPairSchema.shape,
  role: z.literal(
    ["admin", "cashier", "worker", "courier"],
    "Role is required"
  ),
  is_active: isActiveSchema,
  can_process_pickup: z.boolean().default(false),
});

export const POSTUserSchema = userSchema.refine(
  matchesConfirmation,
  confirmationMismatch
);

export const PUTUserSchema = userSchema.omit({
  password: true,
  confirm_password: true,
});

export const PUTUserPasswordSchema = passwordPairSchema.refine(
  matchesConfirmation,
  confirmationMismatch
);

export const POSTOrderSchema = z
  .object({
    // POS sends the typed customer; the server find-or-creates by phone inside
    // the Order transaction (no client-resolved id). See ADR-0011.
    customer: z.object({
      name: varcharSchema("Name"),
      phone_number: phoneSchema,
    }),
    store_id: z.number("Store is required"),
    campaign_ids: campaignIdsSchema,
    voucher_codes: voucherCodesSchema,
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
    // One entry per Item with its Services nested inside, so the cashier types
    // the tag and descriptors once however many Services are added (ADR-0017).
    items: z
      .array(
        z.object(
          {
            brand: optionalVarcharSchema("Brand"),
            color: optionalVarcharSchema("Item Color"),
            model: optionalVarcharSchema("Model"),
            size: optionalVarcharSchema("Size", 64),
            services: z
              .array(
                z.object(
                  {
                    id: z.number("Service is required"),
                    is_priority: z.boolean().optional(),
                    notes: z.string().optional(),
                    // ADR-0018: read only for a Repair whose price is agreed at
                    // drop-off. Ignored for catalog-priced Services, so the
                    // browser can never set their price.
                    price: currencySchema("Price").optional(),
                  },
                  "Service is required"
                )
              )
              // An Item with no Service would never be worked on or priced.
              .min(1, "Every item needs at least one service"),
          },
          "Item is required"
        )
      )
      .optional(),
    discount: currencySchema("Discount").default(0),
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
      const hasAtLeastOneItem = !!(val.products?.length || val.items?.length);
      return hasAtLeastOneItem;
    },
    {
      error: "Product or Service is required",
      path: ["products", "items"],
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
