export const PAYMENT_GATEWAYS = ["midtrans", "doku"] as const;
export type PaymentGatewayName = (typeof PAYMENT_GATEWAYS)[number];

// qris: the cashier shows a QR at the counter. checkout: the customer opens the
// gateway's hosted page from the Track page or a WhatsApp link.
export type GatewayChargeKind = "qris" | "checkout";

export type GatewayChargeStatus =
  | "pending"
  | "paid"
  | "expired"
  | "cancelled"
  | "failed";

export interface GatewayChargeInput {
  amount: number;
  customer: { name: string; phone: string | null };
  expiresInMinutes: number;
  // Where the hosted page sends the customer when done (the Track page).
  finishUrl: string;
  kind: GatewayChargeKind;
  // Our webhook URL for this gateway, so each environment hears its own charges.
  notificationUrl: string;
  // Our id for this attempt, sent as Midtrans order_id / DOKU invoice_number.
  reference: string;
}

export interface GatewayCharge {
  expiresAt: Date;
  // The gateway's own id for the attempt (Midtrans transaction_id or Snap token,
  // DOKU Request-Id), kept for cancel and support lookups.
  providerRef: string | null;
  // Exactly one of these is set: an image of the QR, or a page to open.
  qrImageUrl: string | null;
  redirectUrl: string | null;
}

export interface GatewayChargeRef {
  kind: GatewayChargeKind;
  providerRef: string | null;
  reference: string;
}

export interface GatewayStatusResult {
  // Whole rupiah the gateway says was paid, when it says so.
  amount: number | null;
  raw: unknown;
  status: GatewayChargeStatus;
}

export interface GatewayNotificationInput {
  headers: Record<string, string | undefined>;
  // Path the gateway posted to, e.g. /api/webhooks/payments/doku.
  path: string;
  rawBody: string;
}

export interface GatewayNotification extends GatewayStatusResult {
  reference: string;
}

export interface PaymentGateway {
  // Best effort: a charge the gateway refuses to cancel is left to expire.
  cancelCharge: (ref: GatewayChargeRef) => Promise<void>;
  createCharge: (input: GatewayChargeInput) => Promise<GatewayCharge>;
  getStatus: (ref: GatewayChargeRef) => Promise<GatewayStatusResult>;
  name: PaymentGatewayName;
  // null when the signature does not match; never throws on a bad body.
  verifyNotification: (
    input: GatewayNotificationInput
  ) => Promise<GatewayNotification | null>;
}
