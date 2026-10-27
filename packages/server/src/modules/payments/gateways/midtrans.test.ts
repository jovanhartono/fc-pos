import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { midtransGateway } from "./midtrans";
import type { GatewayChargeInput } from "./types";

const SERVER_KEY = "SB-Mid-server-test";
const AUTH = `Basic ${Buffer.from(`${SERVER_KEY}:`).toString("base64")}`;

interface Call {
  init: RequestInit;
  url: string;
}

const JAKARTA_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \+0700$/;
const realFetch = globalThis.fetch;
let calls: Call[] = [];

const stubFetch = (body: unknown, status = 200) => {
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    );
  }) as unknown as typeof fetch;
};

const headerOf = (call: Call, name: string) =>
  (call.init.headers as Record<string, string>)[name];

const bodyOf = (call: Call) => JSON.parse(call.init.body as string);

const input = (kind: GatewayChargeInput["kind"]): GatewayChargeInput => ({
  kind,
  reference: "FC-12-abcd1234",
  amount: 275_000,
  expiresInMinutes: kind === "qris" ? 15 : 1440,
  customer: { name: "Budi", phone: "08123456789" },
  finishUrl: "https://pos.fresclean.id/track?code=BSD-1&phone=08123456789",
  notificationUrl: "https://pos.fresclean.id/api/webhooks/payments/midtrans",
});

const sign = (
  orderId: string,
  statusCode: string,
  gross: string,
  key: string
) =>
  createHash("sha512")
    .update(orderId + statusCode + gross + key)
    .digest("hex");

const notification = (signatureKey?: string) => {
  const payload = {
    transaction_status: "settlement",
    transaction_id: "trx-1",
    status_code: "200",
    payment_type: "qris",
    order_id: "FC-12-abcd1234",
    gross_amount: "275000.00",
    fraud_status: "accept",
  };
  return {
    ...payload,
    signature_key:
      signatureKey ??
      sign(
        payload.order_id,
        payload.status_code,
        payload.gross_amount,
        SERVER_KEY
      ),
  };
};

const verify = (rawBody: string) =>
  midtransGateway.verifyNotification({
    rawBody,
    headers: {},
    path: "/api/webhooks/payments/midtrans",
  });

beforeEach(() => {
  calls = [];
  process.env.MIDTRANS_SERVER_KEY = SERVER_KEY;
  process.env.MIDTRANS_IS_PRODUCTION = "false";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.MIDTRANS_SERVER_KEY;
  delete process.env.MIDTRANS_IS_PRODUCTION;
});

describe("midtransGateway.createCharge", () => {
  it("charges QRIS through Core API and returns the QR image", async () => {
    stubFetch({
      status_code: "201",
      transaction_id: "trx-1",
      actions: [
        { name: "generate-qr-code", url: "https://qr.example/trx-1" },
        { name: "generate-qr-code-v2", url: "https://qr.example/v2" },
      ],
    });
    const before = Date.now();

    const charge = await midtransGateway.createCharge(input("qris"));

    const [call] = calls;
    expect(call?.url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    expect(call?.init.method).toBe("POST");
    expect(headerOf(call as Call, "Authorization")).toBe(AUTH);
    expect(headerOf(call as Call, "X-Override-Notification")).toBe(
      "https://pos.fresclean.id/api/webhooks/payments/midtrans"
    );
    const body = bodyOf(call as Call);
    expect(body).toMatchObject({
      payment_type: "qris",
      transaction_details: {
        order_id: "FC-12-abcd1234",
        gross_amount: 275_000,
      },
      qris: { acquirer: "gopay" },
      custom_expiry: { expiry_duration: 15, unit: "minute" },
      customer_details: { first_name: "Budi", phone: "08123456789" },
    });
    expect(body.custom_expiry.order_time).toMatch(JAKARTA_TIMESTAMP);
    expect(charge.providerRef).toBe("trx-1");
    expect(charge.qrImageUrl).toBe("https://qr.example/trx-1");
    expect(charge.redirectUrl).toBeNull();
    expect(charge.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 15 * 60_000
    );
  });

  it("opens a Snap checkout with the agreed methods and finish URL", async () => {
    process.env.MIDTRANS_IS_PRODUCTION = "true";
    stubFetch(
      {
        token: "snap-tok",
        redirect_url: "https://app.midtrans.com/r/snap-tok",
      },
      201
    );

    const charge = await midtransGateway.createCharge(input("checkout"));

    const [call] = calls;
    expect(call?.url).toBe("https://app.midtrans.com/snap/v1/transactions");
    expect(headerOf(call as Call, "Authorization")).toBe(AUTH);
    expect(headerOf(call as Call, "X-Override-Notification")).toBe(
      "https://pos.fresclean.id/api/webhooks/payments/midtrans"
    );
    const body = bodyOf(call as Call);
    expect(body.enabled_payments).toEqual([
      "other_qris",
      "gopay",
      "shopeepay",
      "bni_va",
      "bri_va",
      "permata_va",
      "echannel",
    ]);
    expect(body.expiry).toMatchObject({ unit: "minute", duration: 1440 });
    expect(body.expiry.start_time).toMatch(JAKARTA_TIMESTAMP);
    expect(body.callbacks).toEqual({
      finish: "https://pos.fresclean.id/track?code=BSD-1&phone=08123456789",
    });
    expect(charge).toMatchObject({
      providerRef: "snap-tok",
      qrImageUrl: null,
      redirectUrl: "https://app.midtrans.com/r/snap-tok",
    });
  });

  it("throws when Core API refuses inside an HTTP 200", async () => {
    stubFetch({ status_code: "406", status_message: "duplicate order_id" });
    await expect(midtransGateway.createCharge(input("qris"))).rejects.toThrow(
      "Midtrans QRIS charge failed"
    );
  });

  it("names the missing env var only when used", async () => {
    delete process.env.MIDTRANS_SERVER_KEY;
    await expect(midtransGateway.createCharge(input("qris"))).rejects.toThrow(
      "MIDTRANS_SERVER_KEY is not set"
    );
  });
});

describe("midtransGateway.getStatus", () => {
  const ref = {
    kind: "qris" as const,
    reference: "FC-12-abcd1234",
    providerRef: "trx-1",
  };

  it.each([
    [{ transaction_status: "settlement" }, "paid"],
    [{ transaction_status: "capture", fraud_status: "accept" }, "paid"],
    [{ transaction_status: "capture", fraud_status: "challenge" }, "pending"],
    [{ transaction_status: "pending" }, "pending"],
    [{ transaction_status: "expire" }, "expired"],
    [{ transaction_status: "cancel" }, "cancelled"],
    [{ transaction_status: "deny" }, "failed"],
    [{ transaction_status: "failure" }, "failed"],
    [{ transaction_status: "refund" }, "pending"],
  ])("maps %o to %s", async (fields, expected) => {
    stubFetch({ status_code: "200", gross_amount: "275000.00", ...fields });
    const result = await midtransGateway.getStatus(ref);
    expect(result.status as string).toBe(expected);
    expect(result.amount).toBe(275_000);
  });

  it("calls the status URL by our reference", async () => {
    stubFetch({ status_code: "201", transaction_status: "pending" });
    await midtransGateway.getStatus(ref);
    expect(calls[0]?.url).toBe(
      "https://api.sandbox.midtrans.com/v2/FC-12-abcd1234/status"
    );
    expect(headerOf(calls[0] as Call, "Authorization")).toBe(AUTH);
  });

  it("treats an unknown transaction as pending", async () => {
    stubFetch({
      status_code: "404",
      status_message: "Transaction doesn't exist.",
    });
    const result = await midtransGateway.getStatus(ref);
    expect(result).toMatchObject({ status: "pending", amount: null });
  });
});

describe("midtransGateway.cancelCharge", () => {
  it("posts cancel and does not throw when refused", async () => {
    stubFetch({ status_code: "412" });
    await midtransGateway.cancelCharge({
      kind: "qris",
      reference: "FC-12-abcd1234",
      providerRef: "trx-1",
    });
    expect(calls[0]?.url).toBe(
      "https://api.sandbox.midtrans.com/v2/FC-12-abcd1234/cancel"
    );
    expect(calls[0]?.init.method).toBe("POST");
  });
});

describe("midtransGateway.verifyNotification", () => {
  it("accepts a correctly signed settlement", async () => {
    const result = await verify(JSON.stringify(notification()));
    expect(result).toMatchObject({
      reference: "FC-12-abcd1234",
      status: "paid",
      amount: 275_000,
    });
  });

  it("rejects a tampered amount", async () => {
    const body = { ...notification(), gross_amount: "1000.00" };
    expect(await verify(JSON.stringify(body))).toBeNull();
  });

  it("rejects a signature made with another server key", async () => {
    const body = notification(
      sign("FC-12-abcd1234", "200", "275000.00", "other-key")
    );
    expect(await verify(JSON.stringify(body))).toBeNull();
  });

  it("rejects a body without signature_key", async () => {
    const { signature_key: _drop, ...body } = notification();
    expect(await verify(JSON.stringify(body))).toBeNull();
  });

  it("rejects a reformatted gross_amount", async () => {
    const body = { ...notification(), gross_amount: "275000" };
    expect(await verify(JSON.stringify(body))).toBeNull();
  });

  it("returns null instead of throwing on bad JSON or a missing key", async () => {
    expect(await verify("not json")).toBeNull();
    delete process.env.MIDTRANS_SERVER_KEY;
    expect(await verify(JSON.stringify(notification()))).toBeNull();
  });
});
