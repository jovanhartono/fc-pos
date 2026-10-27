import { Hono } from "hono";
import { html, raw } from "hono/html";
import { z } from "zod";
import { NotFoundException } from "@/http-exceptions";
import {
  buildMockNotification,
  type MockNotification,
  mockQrSvg,
} from "@/modules/payments/gateways/mock";
import {
  findOrderPaymentState,
  findPaymentChargeByReference,
} from "@/modules/payments/payment-charge.repository";
import { zodValidator } from "@/utils/zod-validator-wrapper";

// Stands in for the gateway's hosted page during development: each button sends
// the notification the real gateway would, to our real webhook, and shows what
// came back. Mounted only when PAYMENT_GATEWAY_MOCK=true outside production.

const OUTCOMES = {
  paid: "Pay",
  wrong_amount: "Pay Rp 1.000 more",
  expired: "Let it expire",
  failed: "Decline",
} as const;

const GATEWAY_LABELS = { doku: "DOKU", midtrans: "Midtrans" } as const;

const referenceParam = z.object({ reference: z.string().max(50) });
const notifyForm = z.object({
  outcome: z.enum(Object.keys(OUTCOMES) as [keyof typeof OUTCOMES]),
  tamper: z.literal("on").optional(),
  finish: z.string().optional(),
});

const HTTP_URL_REGEX = /^https?:\/\//;

const safeFinish = (finish: string | undefined) =>
  finish && HTTP_URL_REGEX.test(finish) ? finish : null;

interface WebhookLog {
  notification: MockNotification;
  response: string;
  status: number;
}

const loadCharge = async (reference: string) => {
  const charge = await findPaymentChargeByReference(reference);
  if (!charge) {
    throw new NotFoundException("No charge with this reference");
  }
  const order = await findOrderPaymentState(charge.order_id);
  return { charge, order };
};

const page = ({
  charge,
  order,
  finish,
  log,
}: Awaited<ReturnType<typeof loadCharge>> & {
  finish: string | null;
  log?: WebhookLog;
}) => html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${GATEWAY_LABELS[charge.gateway]} mock</title>
<style>
  :root { color-scheme: light; font-family: -apple-system, "Inter", system-ui, sans-serif; }
  body { margin: 0; background: #f2f2f7; color: #000; }
  main { max-width: 440px; margin: 0 auto; padding: 16px; display: grid; gap: 12px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h1 { font-size: 17px; margin: 0; }
  .badge { font-size: 11px; font-weight: 600; background: #ff9500; color: #fff; border-radius: 999px; padding: 2px 8px; }
  section { background: #fff; border: 1px solid #e5e5ea; border-radius: 12px; padding: 16px; display: grid; gap: 8px; }
  .amount { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .muted { color: #8e8e93; font-size: 13px; }
  .qr { width: 220px; justify-self: center; }
  form { display: grid; gap: 8px; }
  button { font: inherit; font-size: 15px; height: 44px; border-radius: 10px; border: 1px solid #d1d1d6; background: #fff; cursor: pointer; }
  button.primary { background: #007aff; border-color: #007aff; color: #fff; font-weight: 600; }
  label { font-size: 13px; display: flex; gap: 6px; align-items: center; }
  pre { margin: 0; font-size: 12px; white-space: pre-wrap; word-break: break-all; background: #f2f2f7; border-radius: 8px; padding: 8px; }
  .ok { color: #248a3d; } .bad { color: #d70015; }
  a { color: #007aff; }
</style>
</head>
<body>
<main>
  <header>
    <h1>${GATEWAY_LABELS[charge.gateway]} ${charge.kind === "qris" ? "QRIS" : "Checkout"}</h1>
    <span class="badge">MOCK</span>
  </header>
  <section aria-label="Charge">
    <span class="muted">${order?.code} · ${order?.customer?.name ?? ""}</span>
    <span class="amount">Rp ${Number(charge.amount).toLocaleString("id-ID")}</span>
    <span class="muted">Reference ${charge.reference}</span>
    ${charge.kind === "qris" ? html`<span class="qr">${raw(mockQrSvg(charge.reference))}</span>` : ""}
  </section>
  <section aria-label="Simulate">
    <form method="post" action="/api/mock-gateway/${charge.reference}/notify">
      <input type="hidden" name="finish" value="${finish ?? ""}">
      ${Object.entries(OUTCOMES).map(
        ([outcome, label]) =>
          html`<button type="submit" name="outcome" value="${outcome}" class="${outcome === "paid" ? "primary" : ""}">${label}</button>`
      )}
      <label><input type="checkbox" name="tamper"> Send with a bad signature</label>
    </form>
  </section>
  ${log ? webhookSection(log) : ""}
  <section aria-label="Now">
    <span>Charge: <strong>${charge.status}</strong>${charge.review_reason ? html` — ${charge.review_reason}` : ""}</span>
    <span>Order: <strong>${order?.payment_status}</strong></span>
    ${finish ? html`<a href="${finish}">Back to Fresclean</a>` : ""}
  </section>
</main>
</body>
</html>`;

const webhookSection = ({ notification, status, response }: WebhookLog) => html`
  <section aria-label="Webhook">
    <strong>Sent to our webhook</strong>
    <pre>POST ${notification.path}
${Object.entries(notification.headers)
  .map(([name, value]) => `${name}: ${value}`)
  .join("\n")}

${JSON.stringify(JSON.parse(notification.body), null, 2)}</pre>
    <strong class="${status < 300 ? "ok" : "bad"}">Webhook answered ${status}</strong>
    <pre>${response}</pre>
  </section>`;

const app = new Hono()
  .get("/:reference", zodValidator("param", referenceParam), async (c) => {
    const state = await loadCharge(c.req.valid("param").reference);
    return c.html(
      page({ ...state, finish: safeFinish(c.req.query("finish")) })
    );
  })
  .get("/:reference/qr.svg", zodValidator("param", referenceParam), (c) => {
    c.header("Content-Type", "image/svg+xml");
    return c.body(mockQrSvg(c.req.valid("param").reference));
  })
  .post(
    "/:reference/notify",
    zodValidator("param", referenceParam),
    zodValidator("form", notifyForm),
    async (c) => {
      const { charge } = await loadCharge(c.req.valid("param").reference);
      const form = c.req.valid("form");
      const notification = buildMockNotification({
        amount: Number(charge.amount),
        gateway: charge.gateway,
        outcome: form.outcome,
        reference: charge.reference,
        tamper: form.tamper === "on",
      });

      // Over HTTP, like the gateway, so the request takes the real route.
      const response = await fetch(
        `http://localhost:${process.env.PORT ?? "8000"}${notification.path}`,
        {
          body: notification.body,
          headers: notification.headers,
          method: "POST",
        }
      );

      const state = await loadCharge(charge.reference);
      return c.html(
        page({
          ...state,
          finish: safeFinish(form.finish),
          log: {
            notification,
            response: await response.text(),
            status: response.status,
          },
        })
      );
    }
  );

export default app;
