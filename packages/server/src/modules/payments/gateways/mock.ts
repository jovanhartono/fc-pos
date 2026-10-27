import { createHash, randomUUID } from "node:crypto";
import { signatureOf as dokuSignature } from "./doku";
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
    const page = `${origin}/api/mock-gateway/${input.reference}`;
    return Promise.resolve({
      providerRef: `mock-${randomUUID()}`,
      // Like Midtrans: a QR in the sheet for counter QRIS. The page link rides
      // along so a laptop can stand in for the Customer's phone.
      qrImageUrl:
        real.name === "midtrans" && input.kind === "qris"
          ? `${page}/qr.svg`
          : null,
      redirectUrl: `${page}?finish=${encodeURIComponent(input.finishUrl)}`,
      expiresAt: new Date(Date.now() + input.expiresInMinutes * 60_000),
    });
  },
  // The mock page drives every change through the webhook.
  getStatus: () =>
    Promise.resolve({ status: "pending", amount: null, raw: { mock: true } }),
  cancelCharge: () => Promise.resolve(),
});

const MILLIS_REGEX = /\.\d{3}Z$/;
// The last base64 character before any padding.
const LAST_SIGNATURE_CHAR_REGEX = /.(?==*$)/;

export type MockOutcome = "paid" | "wrong_amount" | "expired" | "failed";

export interface MockNotification {
  body: string;
  headers: Record<string, string>;
  path: string;
}

const MIDTRANS_STATUS: Record<MockOutcome, [string, string]> = {
  expired: ["expire", "202"],
  failed: ["deny", "202"],
  paid: ["settlement", "200"],
  wrong_amount: ["settlement", "200"],
};

const DOKU_STATUS: Record<MockOutcome, string> = {
  expired: "EXPIRED",
  failed: "FAILED",
  paid: "SUCCESS",
  wrong_amount: "SUCCESS",
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
  const paidAmount = outcome === "wrong_amount" ? amount + 1000 : amount;
  const path = `/api/webhooks/payments/${gateway}`;

  if (gateway === "midtrans") {
    const [transactionStatus, statusCode] = MIDTRANS_STATUS[outcome];
    const grossAmount = `${paidAmount}.00`;
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
  const timestamp = new Date().toISOString().replace(MILLIS_REGEX, "Z");
  const body = JSON.stringify({
    channel: { id: "QRIS_DOKU" },
    order: { amount: paidAmount, invoice_number: reference },
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

// A QR-looking pattern seeded by the reference. It encodes nothing; the mock
// page is opened from the link under it.
export const mockQrSvg = (reference: string) => {
  const size = 25;
  const bits = createHash("sha512").update(reference).digest();
  const isFinder = (x: number, y: number) =>
    [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
  const finderDark = (x: number, y: number) => {
    const fx = x < 7 ? 0 : size - 7;
    const fy = y < 7 ? 0 : size - 7;
    const dx = x - fx;
    const dy = y - fy;
    const ring = Math.min(dx, dy, 6 - dx, 6 - dy);
    return ring !== 1;
  };

  const cells: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const dark = isFinder(x, y)
        ? finderDark(x, y)
        : (bits[index % bits.length] + index) % 2 === 1;
      if (dark) {
        cells.push(`<rect x="${x + 2}" y="${y + 2}" width="1" height="1"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + 4} ${size + 4}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${cells.join("")}</g></svg>`;
};
