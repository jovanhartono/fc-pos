import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { JwtVariables } from "hono/jwt";
import type {
  GatewayNotificationInput,
  PaymentGateway,
} from "@/modules/payments/gateways/types";
import type { AuthUser } from "@/types";
import { errorHandler } from "@/utils/error-handler";

// Every repository reached on import prepares a statement, and no charge is
// ever found, so a verified notification ends as "unknown reference".
const preparedStub: Record<string, unknown> = {};
preparedStub.prepare = () => preparedStub;
preparedStub.execute = () => Promise.resolve(undefined);

mock.module("@/db", () => ({
  db: {
    query: new Proxy(
      {},
      { get: () => new Proxy({}, { get: () => () => preparedStub }) }
    ),
  },
}));

const received: GatewayNotificationInput[] = [];

// Signed by the gateway only when the body says so.
const fakeGateway: PaymentGateway = {
  name: "doku",
  createCharge: () => Promise.reject(new Error("not used")),
  getStatus: () => Promise.reject(new Error("not used")),
  cancelCharge: () => Promise.resolve(),
  verifyNotification: (input) => {
    received.push(input);
    return Promise.resolve(
      input.rawBody === "signed"
        ? {
            amount: 100_000,
            raw: {},
            reference: "FC-1-abcdefgh",
            status: "paid",
          }
        : null
    );
  },
};

mock.module("@/modules/payments/gateways", () => ({
  activePaymentGatewayName: () => "midtrans",
  getPaymentGateway: () => fakeGateway,
}));

const webhookRoutes = (await import("@/routes/webhooks")).default;

const app = new Hono<{ Variables: JwtVariables<AuthUser> }>()
  .basePath("/api")
  .route("/webhooks", webhookRoutes);
app.onError(errorHandler);

const notify = (gateway: string, body: string) =>
  app.request(`/api/webhooks/payments/${gateway}`, {
    body,
    headers: { "Client-Id": "BRN-0001", "Content-Type": "application/json" },
    method: "POST",
  });

describe("POST /webhooks/payments/:gateway", () => {
  it("answers 401 when the signature does not match", async () => {
    const res = await notify("doku", "tampered");

    expect(res.status).toBe(401);
  });

  it("hands the adapter the raw body, the headers and the path it was posted to", async () => {
    received.length = 0;

    await notify("doku", "signed");

    expect(received[0]).toMatchObject({
      path: "/api/webhooks/payments/doku",
      rawBody: "signed",
    });
    expect(received[0]?.headers["client-id"]).toBe("BRN-0001");
  });

  it("answers 200 for a signed notification about a charge it does not know", async () => {
    // Listening on DOKU while Midtrans is active: a late payment from before a
    // switch must still be heard.
    const res = await notify("doku", "signed");

    expect(res.status).toBe(200);
  });

  it("does not listen for a gateway it has no adapter for", async () => {
    const res = await notify("paypal", "signed");

    expect(res.status).toBe(400);
  });
});
