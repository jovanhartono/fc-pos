import { randomUUID } from "node:crypto";
import { signatureOf as dokuSignature, dokuTimestamp } from "./doku";
import { signatureOf as midtransSignature } from "./midtrans";
import type { PaymentGateway, PaymentGatewayName } from "./types";

// Off unless asked for, and never in production: the mock marks Orders paid
// with no money behind them.
export const isMockGatewayEnabled = () =>
  process.env.PAYMENT_GATEWAY_MOCK === "true" &&
  process.env.VERCEL_ENV !== "production";

// Keeps the real adapter's verifyNotification, so the mock page's webhook goes
// through the same signature check a real gateway's would.
export const withMockGateway = (real: PaymentGateway): PaymentGateway => ({
  ...real,
  createCharge(input) {
    const { origin } = new URL(input.notificationUrl);
    const page = `${origin}/api/mock-gateway/${input.reference}?finish=${encodeURIComponent(input.finishUrl)}`;
    return Promise.resolve({
      providerRef: `mock-${randomUUID()}`,
      // The QR opens the mock page on a real phone; the link under it lets a
      // laptop stand in for one.
      qrContent: page,
      qrImageUrl: null,
      redirectUrl: page,
      expiresAt: new Date(Date.now() + input.expiresInMinutes * 60_000),
    });
  },
  // The mock page drives every change through the webhook.
  getStatus: () =>
    Promise.resolve({ status: "pending", amount: null, raw: { mock: true } }),
  cancelCharge: () => Promise.resolve(),
});

// The last base64 character before any padding.
const LAST_SIGNATURE_CHAR_REGEX = /.(?==*$)/;

// No "paid a different amount": QRIS and checkout lock the amount we send.
export type MockOutcome = "paid" | "expired" | "failed";

export interface MockNotification {
  body: string;
  headers: Record<string, string>;
  path: string;
}

const MIDTRANS_STATUS: Record<MockOutcome, [string, string]> = {
  expired: ["expire", "202"],
  failed: ["deny", "202"],
  paid: ["settlement", "200"],
};

const DOKU_STATUS: Record<MockOutcome, string> = {
  expired: "EXPIRED",
  failed: "FAILED",
  paid: "SUCCESS",
};

// Builds the notification the real gateway would send, signed with this
// environment's keys, so the webhook cannot tell it from the real thing.
export const buildMockNotification = ({
  gateway,
  reference,
  amount,
  outcome,
  tamper,
}: {
  gateway: PaymentGatewayName;
  reference: string;
  amount: number;
  outcome: MockOutcome;
  tamper: boolean;
}): MockNotification => {
  const path = `/api/webhooks/payments/${gateway}`;

  if (gateway === "midtrans") {
    const [transactionStatus, statusCode] = MIDTRANS_STATUS[outcome];
    const grossAmount = `${amount}.00`;
    const signature = midtransSignature(
      reference,
      statusCode,
      grossAmount,
      process.env.MIDTRANS_SERVER_KEY ?? ""
    ).toString("hex");
    const body = JSON.stringify({
      currency: "IDR",
      fraud_status: "accept",
      gross_amount: grossAmount,
      merchant_id: "MOCK",
      order_id: reference,
      payment_type: "qris",
      signature_key: tamper
        ? `${signature.startsWith("0") ? "1" : "0"}${signature.slice(1)}`
        : signature,
      status_code: statusCode,
      status_message: "midtrans payment notification",
      transaction_id: randomUUID(),
      transaction_status: transactionStatus,
      transaction_time: new Date().toISOString(),
    });
    return {
      body,
      headers: { "Content-Type": "application/json" },
      path,
    };
  }

  const clientId = process.env.DOKU_CLIENT_ID ?? "";
  const requestId = randomUUID();
  const timestamp = dokuTimestamp();
  const body = JSON.stringify({
    channel: { id: "QRIS_DOKU" },
    order: { amount, invoice_number: reference },
    service: { id: "QRIS" },
    transaction: {
      date: timestamp,
      status: DOKU_STATUS[outcome],
    },
  });
  const signature = dokuSignature(process.env.DOKU_SECRET_KEY ?? "", {
    body,
    clientId,
    requestId,
    target: path,
    timestamp,
  });
  return {
    body,
    headers: {
      "Client-Id": clientId,
      "Content-Type": "application/json",
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      Signature: tamper
        ? signature.replace(LAST_SIGNATURE_CHAR_REGEX, (c) =>
            c === "A" ? "B" : "A"
          )
        : signature,
    },
    path,
  };
};
