import { Hono } from "hono";
import { getPaymentGatewayInfo } from "@/modules/payments/payment-charge.service";
import type { AdminEnv } from "@/types/hono";
import { success } from "@/utils/http";

// The POS shows QRIS and the payment link only when this names a gateway and
// an active PaymentMethod.
const app = new Hono<AdminEnv>().get("/", async (c) =>
  c.json(success(await getPaymentGatewayInfo()))
);

export default app;
