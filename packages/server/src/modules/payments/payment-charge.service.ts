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
  findNewestPendingCheckoutCharge,
  findOrderForCharge,
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

export function toPaymentChargeView(charge: PaymentCharge) {
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
  };
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

// After a cash payment, so a QR left open on a phone cannot take the money
// twice. Never fails the payment that already went through.
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

  // A Customer tapping Pay again gets the page they already opened.
  if (kind === "checkout") {
    const open = await findNewestPendingCheckoutCharge(orderId, gatewayName);
    if (
      open?.redirect_url &&
      Number(open.amount) === amount &&
      open.expires_at.getTime() - Date.now() > REUSE_MIN_LEFT_MS
    ) {
      return toPaymentChargeView(open);
    }
  }

  const order = await findOrderForCharge(orderId);

  if (!order) {
    throw new NotFoundException("Order not found");
  }

  const cancelling = cancelAtGateway(
    await updatePendingChargesCancelled(orderId)
  );

  try {
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
      throw new BadRequestException(`${label} did not respond, try again`, {
        cause: error,
      });
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

  // Covers a webhook that never arrived, without the POS's polling turning
  // into a gateway call every few seconds.
  const now = Date.now();
  if (
    charge.status !== "pending" ||
    now - charge.created_at.getTime() < STATUS_CHECK_AFTER_MS
  ) {
    return toPaymentChargeView(charge);
  }

  const [claimed] = await updateChargeStatusCheckedAt(
    charge.id,
    new Date(now - STATUS_CHECK_EVERY_MS)
  );
  if (!claimed) {
    return toPaymentChargeView(charge);
  }

  try {
    const result = await getPaymentGateway(charge.gateway).getStatus({
      kind: charge.kind,
      providerRef: charge.provider_ref,
      reference: charge.reference,
    });
    await applyGatewayStatus(charge, result);
  } catch (error) {
    console.error("gateway status check failed", charge.reference, error);
  }

  const fresh = await findPaymentChargeById(orderId, chargeId);
  return toPaymentChargeView(fresh ?? charge);
}

// The cashier closes the QRIS; a charge that just got paid stays paid.
export async function cancelPaymentCharge(orderId: number, chargeId: number) {
  const cancelled = await updatePendingChargesCancelled(orderId, chargeId);
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
    return { can_pay_online: false, net_due: 0 };
  }

  // Nothing is refunded before an Order is paid.
  const netDue = orderNetDue({
    discount: Number(order.discount),
    grossTotal: Number(order.total),
    refunded: 0,
  });

  if (netDue <= 0) {
    return { can_pay_online: false, net_due: netDue };
  }

  const [{ payment_method }, lines] = await Promise.all([
    getPaymentGatewayInfo(),
    findSettlementLines(db, order.id),
  ]);

  return {
    can_pay_online: payment_method !== null && !hasUnpricedLine(lines),
    net_due: netDue,
  };
}
