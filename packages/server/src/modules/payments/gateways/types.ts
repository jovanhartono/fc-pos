export const PAYMENT_GATEWAYS = ["midtrans", "doku"] as const;
export type PaymentGatewayName = (typeof PAYMENT_GATEWAYS)[number];

export const GATEWAY_LABELS: Record<PaymentGatewayName, string> = {
  doku: "DOKU",
  midtrans: "Midtrans",
};

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
  // Our webhook URL for this gateway, so each environment hears its own charges.
  notificationUrl: string;
  // Our id for this attempt, sent as Midtrans order_id / DOKU invoice_number.
  reference: string;
}

export interface GatewayCharge {
  expiresAt: Date;
  // The gateway's own id for the attempt (Midtrans transaction_id, DOKU
  // referenceNo or Request-Id), kept for cancel and support lookups.
  providerRef: string | null;
  // How the Customer pays: the QRIS text to draw (DOKU SNAP), an image of the
  // QR (Midtrans), or a page to open (DOKU without SNAP keys).
  qrContent: string | null;
  qrImageUrl: string | null;
  redirectUrl: string | null;
}

export interface GatewayChargeRef {
  // DOKU's own QR (SNAP) rather than its page: each is checked and cancelled
  // through its own API, whatever keys are set today.
  hasQr: boolean;
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
