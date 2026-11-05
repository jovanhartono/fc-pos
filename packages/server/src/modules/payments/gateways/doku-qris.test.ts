import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  verify,
} from "node:crypto";
import { dokuGateway } from "./doku";
import { clearDokuQrisToken } from "./doku-qris";
import type { GatewayChargeInput, GatewayChargeRef } from "./types";

const CLIENT_ID = "BRN-0001-TEST";
const SECRET = "test-secret";
const TOKEN = "token-abc";
const JAKARTA_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/;
const DIGITS_REGEX = /^\d+$/;

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const ENV: Record<string, string> = {
  DOKU_CLIENT_ID: CLIENT_ID,
  DOKU_SECRET_KEY: SECRET,
  // Stored on one line, the way a .env value carries it.
  DOKU_PRIVATE_KEY: privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString()
    .replaceAll("\n", "\\n"),
  DOKU_QRIS_MERCHANT_ID: "MCH-QRIS-1",
  DOKU_QRIS_TERMINAL_ID: "FCKMG01",
  DOKU_QRIS_POSTAL_CODE: "14240",
};
const originalEnv = Object.fromEntries(
  [...Object.keys(ENV), "DOKU_IS_PRODUCTION"].map((key) => [
    key,
    process.env[key],
  ])
);
const originalFetch = globalThis.fetch;

interface Captured {
  body: string;
  headers: Record<string, string>;
  url: string;
}
let calls: Captured[] = [];

// Answers in order; the token call comes first whenever no token is cached.
const stubFetch = (...responses: Response[]) => {
  calls = [];
  const queue = [...responses];
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: String(init.body),
    });
    const next = queue.shift();
    return next
      ? Promise.resolve(next)
      : Promise.reject(new Error("unexpected fetch"));
  }) as typeof fetch;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });
const tokenResponse = () =>
  json({ responseCode: "2007300", accessToken: TOKEN, expiresIn: 900 });

const qrisInput = (): GatewayChargeInput => ({
  kind: "qris",
  reference: "FC-42-abcd1234",
  amount: 275_000,
  expiresInMinutes: 15,
  customer: { name: "Budi", phone: null },
  finishUrl: "https://pos.fresclean.id/track",
  notificationUrl: "https://pos.fresclean.id/api/webhooks/payments/doku",
});

const ref: GatewayChargeRef = {
  kind: "qris",
  providerRef: "DOKU-REF-9",
  reference: "FC-42-abcd1234",
};

beforeEach(() => {
  clearDokuQrisToken();
  Object.assign(process.env, ENV);
  Reflect.deleteProperty(process.env, "DOKU_IS_PRODUCTION");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
});

describe("DOKU QRIS create", () => {
  it("signs in with the private key, then posts a signed generate request", async () => {
    stubFetch(
      tokenResponse(),
      json({
        responseCode: "2004700",
        referenceNo: "DOKU-REF-9",
        qrContent: "00020101021226670016COM.NOBUBANK.WWW",
      })
    );

    const charge = await dokuGateway.createCharge(qrisInput());

    const [token, generate] = calls;
    expect(token.url).toBe(
      "https://api-sandbox.doku.com/authorization/v1/access-token/b2b"
    );
    expect(token.headers["X-CLIENT-KEY"]).toBe(CLIENT_ID);
    expect(token.headers["X-TIMESTAMP"]).toMatch(JAKARTA_TIMESTAMP_REGEX);
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${CLIENT_ID}|${token.headers["X-TIMESTAMP"]}`),
        publicKey,
        Buffer.from(token.headers["X-SIGNATURE"], "base64")
      )
    ).toBe(true);

    const path = "/snap-adapter/b2b/v1.0/qr/qr-mpm-generate";
    expect(generate.url).toBe(`https://api-sandbox.doku.com${path}`);
    expect(generate.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(generate.headers["X-PARTNER-ID"]).toBe(CLIENT_ID);
    expect(generate.headers["CHANNEL-ID"]).toBe("H2H");
    expect(generate.headers["X-EXTERNAL-ID"]).toMatch(DIGITS_REGEX);
    const bodyHash = createHash("sha256").update(generate.body).digest("hex");
    expect(generate.headers["X-SIGNATURE"]).toBe(
      createHmac("sha512", SECRET)
        .update(
          `POST:${path}:${TOKEN}:${bodyHash}:${generate.headers["X-TIMESTAMP"]}`
        )
        .digest("base64")
    );
    expect(JSON.parse(generate.body)).toMatchObject({
      partnerReferenceNo: "FC-42-abcd1234",
      amount: { value: "275000.00", currency: "IDR" },
      merchantId: "MCH-QRIS-1",
      terminalId: "FCKMG01",
      additionalInfo: { postalCode: "14240", feeType: "1" },
    });

    expect(charge.providerRef).toBe("DOKU-REF-9");
    expect(charge.redirectUrl).toBeNull();
    const svg = Buffer.from(
      String(charge.qrImageUrl).replace("data:image/svg+xml;base64,", ""),
      "base64"
    ).toString();
    expect(svg).toStartWith("<svg");
  });

  it("reuses the token for the next request", async () => {
    stubFetch(
      tokenResponse(),
      json({ responseCode: "2004700", referenceNo: "R1", qrContent: "QR1" }),
      json({ responseCode: "2004700", referenceNo: "R2", qrContent: "QR2" })
    );

    await dokuGateway.createCharge(qrisInput());
    await dokuGateway.createCharge(qrisInput());

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/authorization/v1/access-token/b2b",
      "/snap-adapter/b2b/v1.0/qr/qr-mpm-generate",
      "/snap-adapter/b2b/v1.0/qr/qr-mpm-generate",
    ]);
  });

  it("throws with DOKU's answer when the generate is refused", async () => {
    stubFetch(
      tokenResponse(),
      json({ responseCode: "4004701", responseMessage: "Invalid Field" }, 400)
    );

    await expect(dokuGateway.createCharge(qrisInput())).rejects.toThrow(
      "Invalid Field"
    );
  });

  it("falls back to DOKU's hosted page until the QRIS keys are set", async () => {
    Reflect.deleteProperty(process.env, "DOKU_QRIS_MERCHANT_ID");
    stubFetch(
      json({ response: { payment: { url: "https://checkout.doku.com/x" } } })
    );

    const charge = await dokuGateway.createCharge(qrisInput());

    expect(new URL(calls[0].url).pathname).toBe("/checkout/v1/payment");
    expect(charge.redirectUrl).toBe("https://checkout.doku.com/x");
  });
});

describe("DOKU QRIS status", () => {
  it("reads 00 as paid with the amount DOKU reports", async () => {
    stubFetch(
      tokenResponse(),
      json({
        responseCode: "2005100",
        latestTransactionStatus: "00",
        amount: { value: "275000.00", currency: "IDR" },
      })
    );

    const result = await dokuGateway.getStatus(ref);

    expect(JSON.parse(calls[1].body)).toEqual({
      originalReferenceNo: "DOKU-REF-9",
      originalPartnerReferenceNo: "FC-42-abcd1234",
      serviceCode: "47",
      merchantId: "MCH-QRIS-1",
    });
    expect(result).toMatchObject({ status: "paid", amount: 275_000 });
  });

  it("keeps an unscanned QR pending", async () => {
    stubFetch(
      tokenResponse(),
      json({ responseCode: "2005100", latestTransactionStatus: "03" }),
      json({ responseCode: "4045101", responseMessage: "Not Found" }, 404)
    );

    expect((await dokuGateway.getStatus(ref)).status).toBe("pending");
    expect((await dokuGateway.getStatus(ref)).status).toBe("pending");
  });
});

describe("DOKU QRIS cancel", () => {
  it("expires the QR at DOKU", async () => {
    stubFetch(tokenResponse(), json({ responseCode: "2000000" }));

    await dokuGateway.cancelCharge(ref);

    expect(new URL(calls[1].url).pathname).toBe(
      "/snap-adapter/b2b/v1.0/qr/qr-expire"
    );
    expect(JSON.parse(calls[1].body)).toMatchObject({
      partnerReferenceNo: "FC-42-abcd1234",
      referenceNo: "DOKU-REF-9",
      merchantId: "MCH-QRIS-1",
    });
  });

  it("swallows a refusal, since the QR expires on its own", async () => {
    stubFetch(tokenResponse(), json({ responseCode: "4000000" }, 400));

    await expect(dokuGateway.cancelCharge(ref)).resolves.toBeUndefined();
  });
});
