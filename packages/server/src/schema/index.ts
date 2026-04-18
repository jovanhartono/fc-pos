import parsePhoneNumberFromString, {
  isValidPhoneNumber,
} from "libphonenumber-js";
import z from "zod";
import { orderPaymentStatusEnum } from "@/db/schema";

import { ORDER_STATUS_TRANSITIONS as _ORDER_STATUS_TRANSITIONS } from "@/modules/orders/order-admin.schema";

export const ORDER_STATUS_TRANSITIONS = _ORDER_STATUS_TRANSITIONS;

import {
  type CampaignContribution as _CampaignContribution,
  type CampaignDiscountInput as _CampaignDiscountInput,
  computeCampaignContribution as _computeCampaignContribution,
  type StackedDiscount as _StackedDiscount,
  stackCampaignDiscounts as _stackCampaignDiscounts,
} from "@/schema/discount";

export type CampaignContribution<T extends _CampaignDiscountInput> =
  _CampaignContribution<T>;
export type CampaignDiscountInput = _CampaignDiscountInput;
export type StackedDiscount<T extends _CampaignDiscountInput> =
  _StackedDiscount<T>;
export const computeCampaignContribution = _computeCampaignContribution;
export const stackCampaignDiscounts = _stackCampaignDiscounts;

import {
  currencySchema,
  isActiveSchema,
  optionalVarcharSchema,
  phoneSchema,
  textSchema,
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
  role: z.literal(["admin", "cashier", "worker"], "Role is required"),
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

const customerSchema = z.object({
  name: varcharSchema("Name"),
  phone_number: phoneSchema,
  email: z.email("Invalid email address").nullish(),
  address: textSchema("Address").nullish(),
  origin_store_id: z.int({
    error: (issue) =>
      issue.input === undefined
        ? "Origin store is required"
        : "Origin store must be a number",
  }),
});
export const POSTCustomerSchema = customerSchema;
export const PUTCustomerSchema = customerSchema.omit({
  origin_store_id: true,
});

export const POSTStoreSchema = z.object({
  code: z.string().trim().min(3, "Minimum 3 characters").max(3),
  name: z.string().trim().min(1, "Store name is required"),
  phone_number: z
    .string()
    .trim()
    .min(1, "Phone number is required!")
    .refine(isValidPhoneNumber, { error: "Invalid phone number" })
    .pipe(
      z.transform((value) => parsePhoneNumberFromString(value)?.number ?? value)
    ),
  address: z.string().trim().min(1, "Address is required!"),
  latitude: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z
      .number("Latitude is required!")
      .min(-90, "Invalid latitude")
      .max(90, "Invalid latitude")
      .transform(String)
  ),
  longitude: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z
      .number("Longitude is required!")
      .min(-180, "Invalid longitude")
      .max(180, "Invalid longitude")
      .transform(String)
  ),
  is_active: isActiveSchema,
});

export const POSTCategorySchema = z.object({
  name: varcharSchema("name"),
  description: textSchema("Description").nullish(),
  is_active: isActiveSchema,
});

export const POSTServiceSchema = z.object({
  category_id: z
    .int({
      error: (issue) =>
        issue.input === undefined
          ? "Category is required"
          : "Category must be a number",
    })
    .positive("Category must be a valid category ID"),

  code: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Code is required"
          : "Code must be a string",
    })
    .min(1, "Code is required")
    .max(4, "Code must be at most 4 characters")
    .regex(
      /^[A-Z0-9]+$/,
      "Code must contain only uppercase letters and numbers"
    ),

  cogs: currencySchema("COGS"),
  price: currencySchema("Price"),

  name: varcharSchema("Name"),
  description: textSchema("Description").nullish(),
  is_active: isActiveSchema,
  is_priority: z.boolean().default(false),
});

export const POSTPaymentMethodSchema = z.object({
  name: varcharSchema("Payment Method"),
  code: varcharSchema("Code"),
  is_active: isActiveSchema,
});

export const POSTProductSchema = z.object({
  name: varcharSchema("Name"),
  description: textSchema("Description").nullish(),
  is_active: isActiveSchema,
  sku: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "SKU is required" : "SKU must be a string",
    })
    .min(1, "SKU is required")
    .regex(
      /^[A-Z0-9]+$/,
      "SKU must contain only uppercase letters and numbers"
    ),
  uom: varcharSchema("UOM"),
  stock: z.int("Stock is required"),

  category_id: z
    .int({
      error: (issue) =>
        issue.input === undefined
          ? "Category is required"
          : "Category must be a number",
    })
    .positive("Category must be a valid category ID"),

  cogs: currencySchema("COGS"),
  price: currencySchema("Price"),
});

export const POSTOrderSchema = z
  .object({
    customer_id: z.number("Customer is required"),
    store_id: z.number("Store ID is required"),
    campaign_ids: z
      .array(z.number().int().positive())
      .default([])
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Duplicate campaign IDs are not allowed"
      ),
    products: z
      .array(
        z.object(
          {
            id: z.number("Product is required"),
            qty: z.int().positive("Quantity must be positive"),
            notes: z.string().optional(),
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
