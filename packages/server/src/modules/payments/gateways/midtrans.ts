import { createHash, timingSafeEqual } from "node:crypto";
import type {
  GatewayCharge,
  GatewayChargeInput,
  GatewayChargeRef,
  GatewayChargeStatus,
  GatewayNotification,
  GatewayNotificationInput,
  GatewayStatusResult,
  PaymentGateway,
} from "./types";

const SNAP_ENABLED_PAYMENTS = [
  "other_qris",
  "gopay",
  "shopeepay",
  "bni_va",
  "bri_va",
  "permata_va",
  "echannel",
];

const TIMEOUT_MS = 10_000;
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

interface MidtransConfig {
  coreBase: string;
  serverKey: string;
  snapBase: string;
}

interface MidtransStatusBody {
  fraud_status?: string;
  gross_amount?: string;
  status_code?: string;
  transaction_status?: string;
}

const readConfig = (): MidtransConfig => {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    throw new Error("MIDTRANS_SERVER_KEY is not set");
  }
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
  return {
    serverKey,
    coreBase: isProduction
      ? "https://api.midtrans.com"
      : "https://api.sandbox.midtrans.com",
    snapBase: isProduction
      ? "https://app.midtrans.com"
      : "https://app.sandbox.midtrans.com",
  };
};

export const signatureOf = (
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string
) =>
  createHash("sha512")
    .update(orderId + statusCode + grossAmount + serverKey)
    .digest();

const headersFor = (serverKey: string, notificationUrl?: string) => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
  };
  if (notificationUrl) {
    headers["X-Override-Notification"] = notificationUrl;
  }
  return headers;
};

// "2026-10-27 14:05:00 +0700", the only time format Midtrans accepts.
const jakartaTimestamp = (date: Date) =>
  `${new Date(date.getTime() + JAKARTA_OFFSET_MS)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ")} +0700`;

// Always an object, so an HTML error page still reaches the thrown message.
const readJson = async (
  response: Response
): Promise<Record<string, unknown>> => {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return { body: text };
};

const toAmount = (grossAmount: unknown): number | null => {
  if (typeof grossAmount !== "string" && typeof grossAmount !== "number") {
    return null;
  }
  const amount = Number(grossAmount);
  return Number.isFinite(amount) ? amount : null;
};

// Refunds and chargebacks only follow a settled charge, which is already paid
// on our side, so they map to pending and change nothing.
const mapStatus = (body: MidtransStatusBody): GatewayChargeStatus => {
  switch (body.transaction_status) {
    case "settlement":
      return "paid";
    case "capture":
      return body.fraud_status === "accept" ? "paid" : "pending";
    case "expire":
      return "expired";
    case "cancel":
      return "cancelled";
    case "deny":
    case "failure":
      return "failed";
    default:
      return "pending";
  }
};

const customerDetails = (customer: GatewayChargeInput["customer"]) => ({
  first_name: customer.name,
  ...(customer.phone ? { phone: customer.phone } : {}),
});

const createQris = async (
  config: MidtransConfig,
  input: GatewayChargeInput,
  now: Date
): Promise<GatewayCharge> => {
  const response = await fetch(`${config.coreBase}/v2/charge`, {
    method: "POST",
    headers: headersFor(config.serverKey, input.notificationUrl),
    body: JSON.stringify({
      payment_type: "qris",
      transaction_details: {
        order_id: input.reference,
        gross_amount: input.amount,
      },
      qris: { acquirer: "gopay" },
      custom_expiry: {
        order_time: jakartaTimestamp(now),
        expiry_duration: input.expiresInMinutes,
        unit: "minute",
      },
      customer_details: customerDetails(input.customer),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await readJson(response)) as {
    status_code?: string;
    transaction_id?: string;
    actions?: { name?: string; url?: string }[];
  };
  // Core API answers some refusals with HTTP 200 and the real code in the body.
  const qrImageUrl = body.actions?.find(
    (action) => action.name === "generate-qr-code"
  )?.url;
  if (!(response.ok && body.status_code === "201" && qrImageUrl)) {
    throw new Error(
      `Midtrans QRIS charge failed (HTTP ${response.status}): ${JSON.stringify(body)}`
    );
  }
  return {
    providerRef: body.transaction_id ?? null,
    qrImageUrl,
    redirectUrl: null,
    expiresAt: new Date(now.getTime() + input.expiresInMinutes * 60_000),
  };
};

const createCheckout = async (
  config: MidtransConfig,
  input: GatewayChargeInput,
  now: Date
): Promise<GatewayCharge> => {
  const response = await fetch(`${config.snapBase}/snap/v1/transactions`, {
    method: "POST",
    headers: headersFor(config.serverKey, input.notificationUrl),
    body: JSON.stringify({
      transaction_details: {
        order_id: input.reference,
        gross_amount: input.amount,
      },
      enabled_payments: SNAP_ENABLED_PAYMENTS,
      customer_details: customerDetails(input.customer),
      expiry: {
        start_time: jakartaTimestamp(now),
        unit: "minute",
        duration: input.expiresInMinutes,
      },
      callbacks: { finish: input.finishUrl },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await readJson(response)) as {
    token?: string;
    redirect_url?: string;
  };
  if (!(response.ok && body.token && body.redirect_url)) {
    throw new Error(
      `Midtrans Snap checkout failed (HTTP ${response.status}): ${JSON.stringify(body)}`
    );
  }
  return {
    providerRef: body.token,
    qrImageUrl: null,
    redirectUrl: body.redirect_url,
    expiresAt: new Date(now.getTime() + input.expiresInMinutes * 60_000),
  };
};

export const midtransGateway: PaymentGateway = {
  name: "midtrans",

  async createCharge(input) {
    const config = readConfig();
    const now = new Date();
    return await (input.kind === "qris"
      ? createQris(config, input, now)
      : createCheckout(config, input, now));
  },

  async getStatus(ref: GatewayChargeRef): Promise<GatewayStatusResult> {
    const config = readConfig();
    const response = await fetch(
      `${config.coreBase}/v2/${encodeURIComponent(ref.reference)}/status`,
      {
        headers: headersFor(config.serverKey),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    const body = (await readJson(response)) as MidtransStatusBody;
    if (!response.ok) {
      throw new Error(
        `Midtrans status check failed (HTTP ${response.status}): ${JSON.stringify(body)}`
      );
    }
    // A Snap checkout has no transaction until the customer picks a method.
    if (body.status_code === "404") {
      return { status: "pending", amount: null, raw: body };
    }
    return {
      status: mapStatus(body),
      amount: toAmount(body.gross_amount),
      raw: body,
    };
  },

  async cancelCharge(ref) {
    const config = readConfig();
    const response = await fetch(
      `${config.coreBase}/v2/${encodeURIComponent(ref.reference)}/cancel`,
      {
        method: "POST",
        headers: headersFor(config.serverKey),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    const body = (await readJson(response)) as { status_code?: string };
    if (!response.ok || body.status_code !== "200") {
      console.warn("midtrans cancel refused", ref.reference, body);
    }
  },

  verifyNotification(
    input: GatewayNotificationInput
  ): Promise<GatewayNotification | null> {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) {
      console.error("MIDTRANS_SERVER_KEY is not set");
      return Promise.resolve(null);
    }
    try {
      const payload = JSON.parse(input.rawBody) as Record<string, unknown>;
      const {
        order_id: orderId,
        status_code: statusCode,
        gross_amount: grossAmount,
        signature_key: signatureKey,
      } = payload;
      if (
        typeof orderId !== "string" ||
        typeof statusCode !== "string" ||
        typeof grossAmount !== "string" ||
        typeof signatureKey !== "string"
      ) {
        return Promise.resolve(null);
      }
      const expected = signatureOf(orderId, statusCode, grossAmount, serverKey);
      const given = Buffer.from(signatureKey, "hex");
      if (
        given.length !== expected.length ||
        !timingSafeEqual(given, expected)
      ) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        reference: orderId,
        status: mapStatus(payload as MidtransStatusBody),
        amount: toAmount(grossAmount),
        raw: payload,
      });
    } catch {
      return Promise.resolve(null);
    }
  },
};
