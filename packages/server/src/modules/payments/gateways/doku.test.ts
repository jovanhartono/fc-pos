import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { dokuGateway } from "./doku";
import type { GatewayChargeInput } from "./types";

const CLIENT_ID = "BRN-0001-TEST";
const SECRET = "test-secret";
const WEBHOOK_PATH = "/api/webhooks/payments/doku";
const UTC_NO_MILLIS_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

interface Captured {
  init: RequestInit;
  url: string;
}

const ENV_KEYS = ["DOKU_CLIENT_ID", "DOKU_SECRET_KEY", "DOKU_IS_PRODUCTION"];
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
);
const originalFetch = globalThis.fetch;
let calls: Captured[] = [];

const unsetEnv = (key: string) => {
  Reflect.deleteProperty(process.env, key);
};

const stubFetch = (response: Response) => {
  calls = [];
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response);
  }) as typeof fetch;
};

const sign = (component: string, secret = SECRET) =>
  `HMACSHA256=${createHmac("sha256", secret).update(component).digest("base64")}`;

const componentFor = (
  headers: Record<string, string>,
  target: string,
  body?: string
) => {
  let s = `Client-Id:${headers["Client-Id"]}\nRequest-Id:${headers["Request-Id"]}\nRequest-Timestamp:${headers["Request-Timestamp"]}\nRequest-Target:${target}`;
  if (body !== undefined) {
    s += `\nDigest:${createHash("sha256").update(body).digest("base64")}`;
  }
  return s;
};

const chargeInput = (
  overrides: Partial<GatewayChargeInput> = {}
): GatewayChargeInput => ({
  kind: "checkout",
  reference: "FC-42-abcd1234",
  amount: 275_000,
  expiresInMinutes: 1440,
  customer: { name: "Budi", phone: "6281234567890" },
  finishUrl: "https://pos.fresclean.id/track?code=A1&phone=6281234567890",
  notificationUrl: "https://pos.fresclean.id/api/webhooks/payments/doku",
  ...overrides,
});

beforeEach(() => {
  process.env.DOKU_CLIENT_ID = CLIENT_ID;
  process.env.DOKU_SECRET_KEY = SECRET;
  unsetEnv("DOKU_IS_PRODUCTION");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      unsetEnv(key);
    } else {
      process.env[key] = value;
    }
  }
});

describe("dokuGateway.createCharge", () => {
  it("posts a signed Checkout request and returns DOKU's page", async () => {
    stubFetch(
      Response.json({
        message: ["SUCCESS"],
        response: {
          payment: {
            url: "https://sandbox.doku.com/checkout-link-v2/abc",
            expired_date: "20261028140500",
          },
        },
      })
    );

    const charge = await dokuGateway.createCharge(chargeInput());

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0] as Captured;
    expect(url).toBe("https://api-sandbox.doku.com/checkout/v1/payment");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const headers = init.headers as Record<string, string>;
    expect(headers["Client-Id"]).toBe(CLIENT_ID);
    expect(headers["Request-Timestamp"]).toMatch(UTC_NO_MILLIS_REGEX);
    const body = init.body as string;
    expect(headers.Signature).toBe(
      sign(componentFor(headers, "/checkout/v1/payment", body))
    );

    expect(JSON.parse(body)).toEqual({
      order: {
        invoice_number: "FC-42-abcd1234",
        amount: 275_000,
        callback_url:
          "https://pos.fresclean.id/track?code=A1&phone=6281234567890",
      },
      payment: {
        payment_due_date: 1440,
        payment_method_types: [
          "QRIS",
          "VIRTUAL_ACCOUNT_BRI",
          "VIRTUAL_ACCOUNT_BANK_MANDIRI",
          "VIRTUAL_ACCOUNT_BNI",
          "VIRTUAL_ACCOUNT_BANK_PERMATA",
          "EMONEY_SHOPEE_PAY",
          "EMONEY_OVO",
          "EMONEY_DANA",
        ],
      },
      customer: { name: "Budi", phone: "6281234567890" },
      additional_info: {
        override_notification_url:
          "https://pos.fresclean.id/api/webhooks/payments/doku",
      },
    });

    expect(charge).toEqual({
      providerRef: headers["Request-Id"] as string,
      qrImageUrl: null,
      redirectUrl: "https://sandbox.doku.com/checkout-link-v2/abc",
      // 14:05 WIB is 07:05 UTC.
      expiresAt: new Date("2026-10-28T07:05:00Z"),
    });
  });

  it("sends only QRIS for a counter charge, on the production host", async () => {
    process.env.DOKU_IS_PRODUCTION = "true";
    stubFetch(
      Response.json({ response: { payment: { url: "https://doku/qr" } } })
    );

    const before = Date.now();
    const charge = await dokuGateway.createCharge(
      chargeInput({ kind: "qris", expiresInMinutes: 15 })
    );

    const { url, init } = calls[0] as Captured;
    expect(url).toBe("https://api.doku.com/checkout/v1/payment");
    expect(
      JSON.parse(init.body as string).payment.payment_method_types
    ).toEqual(["QRIS"]);
    // No expired_date in the reply: fall back to our own 15 minutes.
    expect(charge.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 15 * 60_000
    );
  });

  it("throws with DOKU's error body on a 400", async () => {
    stubFetch(
      Response.json(
        { error_messages: ["order.amount must greater than 0"] },
        { status: 400 }
      )
    );

    await expect(dokuGateway.createCharge(chargeInput())).rejects.toThrow(
      "order.amount must greater than 0"
    );
  });

  it("names the missing env var only when used", async () => {
    unsetEnv("DOKU_SECRET_KEY");
    stubFetch(Response.json({}));

    await expect(dokuGateway.createCharge(chargeInput())).rejects.toThrow(
      "DOKU_SECRET_KEY is not set"
    );
    expect(calls).toHaveLength(0);
  });
});

describe("dokuGateway.getStatus", () => {
  const ref = {
    kind: "checkout" as const,
    reference: "FC-42-abcd1234",
    providerRef: "req-1",
  };

  it("signs a GET without a Digest line", async () => {
    stubFetch(
      Response.json({
        transaction: { status: "SUCCESS" },
        order: { invoice_number: "FC-42-abcd1234", amount: 275_000 },
      })
    );

    const result = await dokuGateway.getStatus(ref);

    const { url, init } = calls[0] as Captured;
    expect(url).toBe(
      "https://api-sandbox.doku.com/orders/v1/status/FC-42-abcd1234"
    );
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    expect(headers.Signature).toBe(
      sign(componentFor(headers, "/orders/v1/status/FC-42-abcd1234"))
    );
    expect(result.status).toBe("paid");
    expect(result.amount).toBe(275_000);
  });

  it.each([
    ["SUCCESS", "paid"],
    ["EXPIRED", "expired"],
    ["PENDING", "pending"],
    ["REDIRECT", "pending"],
    ["TIMEOUT", "pending"],
    ["FAILED", "pending"],
  ])("maps %s to %s", async (dokuStatus, ours) => {
    stubFetch(Response.json({ transaction: { status: dokuStatus } }));

    const result = await dokuGateway.getStatus(ref);

    expect(result.status).toBe(ours as typeof result.status);
    expect(result.amount).toBeNull();
  });

  it("reads a checkout nobody has paid on yet as pending", async () => {
    stubFetch(new Response("not found", { status: 404 }));

    expect((await dokuGateway.getStatus(ref)).status).toBe("pending");
  });
});

describe("dokuGateway.cancelCharge", () => {
  it("posts the cancellation with the original Request-Id", async () => {
    stubFetch(Response.json({}));

    await dokuGateway.cancelCharge({
      kind: "qris",
      reference: "FC-42-abcd1234",
      providerRef: "req-1",
    });

    const { url, init } = calls[0] as Captured;
    expect(url).toBe("https://api-sandbox.doku.com/checkout/v3/cancellations");
    expect(JSON.parse(init.body as string)).toMatchObject({
      order: { invoice_number: "FC-42-abcd1234" },
      payment: { original_request_id: "req-1" },
    });
  });

  it("swallows a refusal", async () => {
    const { warn } = console;
    console.warn = () => undefined;
    stubFetch(new Response("disabled", { status: 403 }));

    try {
      await expect(
        dokuGateway.cancelCharge({
          kind: "qris",
          reference: "FC-42-abcd1234",
          providerRef: "req-1",
        })
      ).resolves.toBeUndefined();
    } finally {
      console.warn = warn;
    }
  });
});

describe("dokuGateway.verifyNotification", () => {
  const rawBody = JSON.stringify({
    order: { invoice_number: "FC-42-abcd1234", amount: "275000.00" },
    transaction: { status: "SUCCESS", date: "2026-10-27T07:05:00Z" },
  });

  const signedHeaders = (body = rawBody, secret = SECRET) => {
    const headers: Record<string, string> = {
      "Client-Id": CLIENT_ID,
      "Request-Id": "doku-req-9",
      "Request-Timestamp": "2026-10-27T07:05:01Z",
    };
    headers.Signature = sign(componentFor(headers, WEBHOOK_PATH, body), secret);
    return headers;
  };

  const lowercase = (headers: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    );

  let errorLog: typeof console.error;
  beforeEach(() => {
    errorLog = console.error;
    console.error = () => undefined;
  });
  afterEach(() => {
    console.error = errorLog;
  });

  it("accepts a signed paid notification", async () => {
    const result = await dokuGateway.verifyNotification({
      rawBody,
      headers: lowercase(signedHeaders()),
      path: WEBHOOK_PATH,
    });

    expect(result).toMatchObject({
      reference: "FC-42-abcd1234",
      status: "paid",
      amount: 275_000,
    });
  });

  it("keeps a FAILED attempt pending", async () => {
    const body = JSON.stringify({
      order: { invoice_number: "FC-42-abcd1234", amount: 275_000 },
      transaction: { status: "FAILED" },
    });

    const result = await dokuGateway.verifyNotification({
      rawBody: body,
      headers: signedHeaders(body),
      path: WEBHOOK_PATH,
    });

    expect(result?.status).toBe("pending");
  });

  it("rejects a tampered body", async () => {
    const tampered = rawBody.replace("275000.00", "1000.00");

    expect(
      await dokuGateway.verifyNotification({
        rawBody: tampered,
        headers: signedHeaders(),
        path: WEBHOOK_PATH,
      })
    ).toBeNull();
  });

  it("rejects a signature made with another secret", async () => {
    expect(
      await dokuGateway.verifyNotification({
        rawBody,
        headers: signedHeaders(rawBody, "someone-else"),
        path: WEBHOOK_PATH,
      })
    ).toBeNull();
  });

  it("rejects a signature made for another path", async () => {
    expect(
      await dokuGateway.verifyNotification({
        rawBody,
        headers: signedHeaders(),
        path: "/api/webhooks/payments/midtrans",
      })
    ).toBeNull();
  });

  it("rejects a missing Signature header", async () => {
    const { Signature: _dropped, ...headers } = signedHeaders();

    expect(
      await dokuGateway.verifyNotification({
        rawBody,
        headers,
        path: WEBHOOK_PATH,
      })
    ).toBeNull();
  });

  it("rejects another merchant's Client-Id", async () => {
    process.env.DOKU_CLIENT_ID = "BRN-9999-OTHER";

    expect(
      await dokuGateway.verifyNotification({
        rawBody,
        headers: signedHeaders(),
        path: WEBHOOK_PATH,
      })
    ).toBeNull();
  });

  it("returns null for a signed body that is not JSON", async () => {
    const body = "not json";

    expect(
      await dokuGateway.verifyNotification({
        rawBody: body,
        headers: signedHeaders(body),
        path: WEBHOOK_PATH,
      })
    ).toBeNull();
  });

  it("returns null instead of throwing when the secret is unset", async () => {
    unsetEnv("DOKU_SECRET_KEY");

    expect(
      await dokuGateway.verifyNotification({
        rawBody,
        headers: signedHeaders(),
        path: WEBHOOK_PATH,
      })
    ).toBeNull();
  });
});
