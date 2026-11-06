import { z } from "zod";
import { PATCHOrderPaymentSchema } from "@/modules/orders/order-admin.schema";
import { idNumberSchema } from "@/schema/param";
import { zodValidator } from "@/utils/zod-validator-wrapper";

// The same promo fields as Mark as paid; the PaymentMethod is the one linked to
// the gateway, so the cashier does not pick it.
export const POSTPaymentChargeSchema = PATCHOrderPaymentSchema.omit({
  payment_method_id: true,
});

export const paymentChargeParamSchema = zodValidator(
  "param",
  z.object({ id: idNumberSchema, chargeId: idNumberSchema })
);
