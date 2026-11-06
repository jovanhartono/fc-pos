import { Hono } from "hono";
import { z } from "zod";
import { UnauthorizedException } from "@/http-exceptions";
import { PAYMENT_GATEWAYS } from "@/modules/payments/gateways/types";
import { handlePaymentNotification } from "@/modules/payments/payment-charge.service";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

// Both gateways stay reachable whatever PAYMENT_GATEWAY says, so a payment
// made just before a switch still marks its Order paid.
const app = new Hono().post(
  "/payments/:gateway",
  zodValidator("param", z.object({ gateway: z.enum(PAYMENT_GATEWAYS) })),
  async (c) => {
    const verified = await handlePaymentNotification(
      c.req.valid("param").gateway,
      {
        // Raw, because the signature covers the exact bytes the gateway sent.
        headers: c.req.header(),
        path: c.req.path,
        rawBody: await c.req.text(),
      }
    );

    if (!verified) {
      throw new UnauthorizedException("Invalid signature");
    }

    return c.json(success({ ok: true }));
  }
);

export default app;
