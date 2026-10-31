import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "http-status-codes";
import { db } from "@/db";
import { BadRequestException, NotFoundException } from "@/http-exceptions";
import { findSettlementLines } from "@/modules/orders/order.repository";
import {
  markOrderPaid,
  NetDueChangedError,
  quoteOrderNetDue,
} from "@/modules/orders/order-payment.service";
import type { DiscountRequest } from "@/modules/orders/order-settlement.service";
import { findPaymentMethodByGateway } from "@/modules/payment-methods/payment-method.repository";
import {
  activePaymentGatewayName,
  getPaymentGateway,
} from "@/modules/payments/gateways";
import type {
  GatewayCharge,
  GatewayChargeKind,
  GatewayNotificationInput,
  GatewayStatusResult,
  PaymentGatewayName,
} from "@/modules/payments/gateways/types";
import {
  findNewerPaymentCharge,
  findNewestPendingCheckoutCharge,
  findOpenQrisCharge,
  findOrderForCharge,
  findOrderPaymentState,
  findPaymentChargeById,
  findPaymentChargeByReference,
  insertPaymentCharge,
  type PaymentCharge,
  updateChargeStatusCheckedAt,
  updatePaymentChargeById,
  updatePendingChargeStatus,
  updatePendingChargesCancelled,
  updateUnsettledChargeById,
} from "@/modules/payments/payment-charge.repository";
import { orderNetDue } from "@/schema/discount";
import { hasUnpricedLine } from "@/schema/unpriced-line";

const GATEWAY_LABELS: Record<PaymentGatewayName, string> = {
  doku: "DOKU",
  midtrans: "Midtrans",
};

const EXPIRY_MINUTES: Record<GatewayChargeKind, number> = {
  checkout: 1440,
  qris: 15,
};

const MINUTE_MS = 60_000;
// A checkout page with less left than this is replaced, so the Customer is not
// sent to a page that closes while they pick a bank.
const REUSE_MIN_LEFT_MS = 30 * MINUTE_MS;
// The webhook usually lands first; asking sooner only costs gateway calls.
const STATUS_CHECK_AFTER_MS = 20_000;
const STATUS_CHECK_EVERY_MS = 10_000;

const NO_DISCOUNT: DiscountRequest = {
  campaign_ids: [],
  discount: 0,
  voucher_codes: [],
};

const REFERENCE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function newReference(orderId: number) {
  const random = Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]
  ).join("");
  return `FC-${orderId}-${random}`;
}

function publicWebUrl() {
  return process.env.PUBLIC_WEB_URL ?? "https://pos.fresclean.id";
}

type ChargeClosedReason =
  | "order_paid"
  | "customer_paying"
  | "replaced"
  | "order_changed";

interface ChargeClosed {
  closed_reason: ChargeClosedReason | null;
  // What a new QRIS would ask for after the Order changed; null when unknown.
  next_amount: number | null;
}

const NOT_CLOSED: ChargeClosed = { closed_reason: null, next_amount: null };

export function toPaymentChargeView(
  charge: PaymentCharge,
  closed: ChargeClosed = NOT_CLOSED
) {
  return {
    id: charge.id,
    order_id: charge.order_id,
    gateway: charge.gateway,
    kind: charge.kind,
    reference: charge.reference,
    amount: Number(charge.amount),
    status: charge.status,
    review_reason: charge.review_reason,
    qr_image_url: charge.qr_image_url,
    redirect_url: charge.redirect_url,
    expires_at: charge.expires_at,
    paid_at: charge.paid_at,
    created_at: charge.created_at,
    discount_request: charge.discount_request,
    ...closed,
  };
}

// Tells the cashier why the QRIS on their screen closed: a Customer who moved
// to the Track page must not be talked over by a new QR.
async function closedReason(charge: PaymentCharge): Promise<ChargeClosed> {
  const [order, newer] = await Promise.all([
    findOrderPaymentState(charge.order_id),
    findNewerPaymentCharge(charge.order_id, charge.id),
  ]);

  if (order?.payment_status === "paid") {
    return { closed_reason: "order_paid", next_amount: null };
  }
  if (order?.status === "cancelled") {
    return { closed_reason: "order_changed", next_amount: 0 };
  }
  if (newer) {
    return {
      closed_reason: newer.kind === "checkout" ? "customer_paying" : "replaced",
      next_amount: null,
    };
  }

  const nextAmount = await quoteOrderNetDue(
    charge.order_id,
    charge.discount_request ?? NO_DISCOUNT
  ).catch(() => null);
  return { closed_reason: "order_changed", next_amount: nextAmount };
}

async function toPolledView(charge: PaymentCharge) {
  return toPaymentChargeView(
    charge,
    charge.status === "cancelled" ? await closedReason(charge) : NOT_CLOSED
  );
}

// A Customer tapping Pay again gets the page they already opened, unless the
// amount moved or it closes before they could finish.
function isReusableCheckout(
  charge: PaymentCharge | undefined,
  amount: number
): charge is PaymentCharge {
  if (!charge?.redirect_url) {
    return false;
  }
  return (
    Number(charge.amount) === amount &&
    charge.expires_at.getTime() - Date.now() > REUSE_MIN_LEFT_MS
  );
}

export async function getPaymentGatewayInfo() {
  const gateway = activePaymentGatewayName();

  if (!gateway) {
    return { gateway: null, payment_method: null };
  }

  const method = await findPaymentMethodByGateway(gateway);

  return {
    gateway,
    payment_method: method?.is_active
      ? { id: method.id, name: method.name }
      : null,
  };
}

async function requireActiveGateway() {
  const { gateway, payment_method } = await getPaymentGatewayInfo();

  if (!gateway) {
    throw new BadRequestException("Online payment is not set up");
  }
  if (!payment_method) {
    throw new BadRequestException(
      `Link a PaymentMethod to ${GATEWAY_LABELS[gateway]} first`
    );
  }

  return gateway;
}

async function cancelAtGateway(charges: PaymentCharge[]) {
  await Promise.allSettled(
    charges.map((charge) =>
      getPaymentGateway(charge.gateway)
        .cancelCharge({
          kind: charge.kind,
          providerRef: charge.provider_ref,
          reference: charge.reference,
        })
        .catch((error) => {
          console.warn("gateway cancel failed", charge.reference, error);
        })
    )
  );
}

// After a cash payment, a line cancel or a Repair price: a QR still on screen
// would take the old amount. Never fails the change that already went through.
export async function cancelOrderPendingCharges(orderId: number) {
  try {
    await cancelAtGateway(await updatePendingChargesCancelled(orderId));
  } catch (error) {
    console.error("cancelling pending charges failed", orderId, error);
  }
}

export async function createPaymentCharge({
  createdBy,
  kind,
  orderId,
  request,
}: {
  // null = the Customer on the Track page.
  createdBy: number | null;
  kind: GatewayChargeKind;
  orderId: number;
  request: DiscountRequest | null;
}) {
  const gatewayName = await requireActiveGateway();
  const label = GATEWAY_LABELS[gatewayName];

  const amount = await quoteOrderNetDue(orderId, request ?? NO_DISCOUNT);

  if (amount === null) {
    throw new NotFoundException("Order not found");
  }
  if (amount <= 0) {
    throw new BadRequestException("Nothing left to pay on this order");
  }

  if (kind === "checkout") {
    const open = await findNewestPendingCheckoutCharge(orderId, gatewayName);
    if (isReusableCheckout(open, amount)) {
      return toPaymentChargeView(open);
    }
  }

  const order = await findOrderForCharge(orderId);

  if (!order) {
    throw new NotFoundException("Order not found");
  }

  const reference = newReference(orderId);
  const expiresInMinutes = EXPIRY_MINUTES[kind];
  const [charge] = await insertPaymentCharge({
    amount: amount.toString(),
    created_by: createdBy,
    discount_request: request,
    expires_at: new Date(Date.now() + expiresInMinutes * MINUTE_MS),
    gateway: gatewayName,
    kind,
    order_id: orderId,
    reference,
  });

  // After the insert, so a cashier's QRIS closing here already has the
  // Customer's checkout to point at.
  const cancelling = cancelAtGateway(
    await updatePendingChargesCancelled(orderId, { except: charge.id })
  );

  try {
    const phone = order.customer.phone_number;
    const trackParams = new URLSearchParams({
      code: order.code,
      phone: phone.replace(/\D/g, ""),
    });

    let created: GatewayCharge;
    try {
      created = await getPaymentGateway(gatewayName).createCharge({
        amount,
        customer: { name: order.customer.name, phone },
        expiresInMinutes,
        finishUrl: `${publicWebUrl()}/track?${trackParams}`,
        kind,
        notificationUrl: `${publicWebUrl()}/api/webhooks/payments/${gatewayName}`,
        reference,
      });
    } catch (error) {
      console.error("gateway charge failed", { gatewayName, reference, error });
      await updatePaymentChargeById(charge.id, { status: "failed" });
      throw new BadRequestException(
        `${label} isn't responding. Try again in a moment.`,
        { cause: error }
      );
    }

    const [saved] = await updatePaymentChargeById(charge.id, {
      expires_at: created.expiresAt,
      provider_ref: created.providerRef,
      qr_image_url: created.qrImageUrl,
      redirect_url: created.redirectUrl,
    });

    return toPaymentChargeView(saved);
  } finally {
    await cancelling;
  }
}

// Money was taken but the Order could not take it as-is, so the charge waits
// for a person instead of the webhook failing and the gateway retrying forever.
class ChargeReviewError extends Error {}

function reviewReason(error: unknown): string | null {
  if (
    error instanceof ChargeReviewError ||
    error instanceof NetDueChangedError ||
    (error instanceof HTTPException &&
      error.status < StatusCodes.INTERNAL_SERVER_ERROR)
  ) {
    return error.message;
  }
  return null;
}

// Used by the webhook and by the POS status check, which may both report the
// same payment.
export async function applyGatewayStatus(
  charge: PaymentCharge,
  result: GatewayStatusResult
) {
  if (result.status === "pending") {
    return;
  }

  if (result.status !== "paid") {
    await updatePendingChargeStatus(charge.id, {
      last_payload: result.raw,
      status: result.status,
    });
    return;
  }

  if (charge.status === "paid" || charge.status === "needs_review") {
    return;
  }

  const amount = Number(charge.amount);
  const label = GATEWAY_LABELS[charge.gateway];

  try {
    await db.transaction(async (tx) => {
      if (result.amount !== amount) {
        throw new ChargeReviewError(
          `${label} reported ${result.amount} paid against a charge of ${amount}`
        );
      }

      const method = await findPaymentMethodByGateway(charge.gateway, tx);
      if (!method) {
        throw new ChargeReviewError(`No PaymentMethod is linked to ${label}`);
      }

      const paid = await markOrderPaid({
        actorId: charge.created_by,
        expectedNetDue: amount,
        orderId: charge.order_id,
        paymentMethodId: method.id,
        request: charge.discount_request ?? NO_DISCOUNT,
        tx,
      });
      if (!paid) {
        throw new ChargeReviewError("Order not found");
      }

      await updateUnsettledChargeById(tx, charge.id, {
        last_payload: result.raw,
        paid_at: new Date(),
        status: "paid",
      });
    });
  } catch (error) {
    const reason = reviewReason(error);
    if (reason === null) {
      throw error;
    }

    console.warn("gateway charge needs review", charge.reference, reason);
    await updateUnsettledChargeById(db, charge.id, {
      last_payload: result.raw,
      review_reason: reason,
      status: "needs_review",
    });
  }
}

export async function getPaymentCharge(orderId: number, chargeId: number) {
  const charge = await findPaymentChargeById(orderId, chargeId);

  if (!charge) {
    return null;
  }

  return toPolledView(await refreshCharge(charge, STATUS_CHECK_AFTER_MS));
}

// Covers a webhook that never arrived, without every polling screen turning
// into a gateway call every few seconds. Returns the charge as it now stands.
async function refreshCharge(charge: PaymentCharge, minAgeMs: number) {
  const now = Date.now();
  if (
    charge.status !== "pending" ||
    now - charge.created_at.getTime() < minAgeMs ||
    now - charge.updated_at.getTime() < STATUS_CHECK_EVERY_MS
  ) {
    return charge;
  }

  const [claimed] = await updateChargeStatusCheckedAt(
    charge.id,
    new Date(now - STATUS_CHECK_EVERY_MS)
  );
  if (!claimed) {
    return charge;
  }

  try {
    const result = await getPaymentGateway(charge.gateway).getStatus({
      kind: charge.kind,
      providerRef: charge.provider_ref,
      reference: charge.reference,
    });
    if (result.status === "pending") {
      return charge;
    }
    await applyGatewayStatus(charge, result);
  } catch (error) {
    console.error("gateway status check failed", charge.reference, error);
    return charge;
  }
  return (await findPaymentChargeById(charge.order_id, charge.id)) ?? charge;
}

// A QRIS the cashier closed the dialog on, still waiting to be paid. Checked
// like the dialog's own poll, so a lost webhook still turns the Order paid.
export async function getOpenQrisCharge(orderId: number) {
  const open = await findOpenQrisCharge(orderId);
  if (!open) {
    return null;
  }
  const charge = await refreshCharge(open, STATUS_CHECK_AFTER_MS);
  return charge.status === "pending" ? toPaymentChargeView(charge) : null;
}

// The cashier closes the QRIS; a charge that just got paid stays paid.
export async function cancelPaymentCharge(orderId: number, chargeId: number) {
  const cancelled = await updatePendingChargesCancelled(orderId, {
    only: chargeId,
  });
  await cancelAtGateway(cancelled);

  const charge = await findPaymentChargeById(orderId, chargeId);
  return charge ? toPaymentChargeView(charge) : null;
}

// false = the signature did not match; the caller answers 401.
export async function handlePaymentNotification(
  gatewayName: PaymentGatewayName,
  input: GatewayNotificationInput
) {
  const notification =
    await getPaymentGateway(gatewayName).verifyNotification(input);

  if (!notification) {
    return false;
  }

  const charge = await findPaymentChargeByReference(notification.reference);

  if (charge?.gateway !== gatewayName) {
    console.warn("payment notification for unknown charge", {
      gatewayName,
      reference: notification.reference,
    });
    return true;
  }

  await applyGatewayStatus(charge, notification);
  return true;
}

// What the Track page offers: net_due is what the Customer still owes, and Pay
// shows only when the gateway can take exactly that.
export async function getTrackPaymentState(order: {
  discount: string;
  id: number;
  payment_status: "paid" | "unpaid";
  status: string;
  total: string;
}) {
  if (order.payment_status === "paid" || order.status === "cancelled") {
    return { can_pay_online: false, net_due: 0, open_until: null };
  }

  // Nothing is refunded before an Order is paid.
  const netDue = orderNetDue({
    discount: Number(order.discount),
    grossTotal: Number(order.total),
    refunded: 0,
  });

  if (netDue <= 0) {
    return { can_pay_online: false, net_due: netDue, open_until: null };
  }

  const gateway = activePaymentGatewayName();
  const [{ payment_method }, lines, open] = await Promise.all([
    getPaymentGatewayInfo(),
    findSettlementLines(db, order.id),
    gateway ? findNewestPendingCheckoutCharge(order.id, gateway) : undefined,
  ]);

  // The gateway sends a Customer who just paid straight back here, often
  // before its webhook lands: ask, rather than tell them it isn't finished.
  if (open && (await refreshCharge(open, 0)).status === "paid") {
    return { can_pay_online: false, net_due: 0, open_until: null };
  }

  return {
    can_pay_online: payment_method !== null && !hasUnpricedLine(lines),
    net_due: netDue,
    // A Customer back from the gateway unpaid sees Continue Payment.
    open_until: isReusableCheckout(open, netDue) ? open.expires_at : null,
  };
}
