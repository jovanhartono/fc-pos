import { z } from "zod";
import { PATCHOrderPaymentSchema } from "@/modules/orders/order-admin.schema";
import { zodValidator } from "@/utils/zod-validator-wrapper";

// The same promo fields as Mark as paid; the PaymentMethod is the one linked to
// the gateway, so the cashier does not pick it.
export const POSTPaymentChargeSchema = PATCHOrderPaymentSchema.omit({
  payment_method_id: true,
}).extend({
  kind: z.literal("qris"),
});

export const paymentChargeParamSchema = zodValidator(
  "param",
  z.object({
    id: z.coerce.number().int().positive(),
    chargeId: z.coerce.number().int().positive(),
  })
);

export type PostPaymentChargeInput = z.infer<typeof POSTPaymentChargeSchema>;
