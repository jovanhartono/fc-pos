import { getPaymentGateway } from "@/modules/payments/gateways";
import type { GatewayChargeRef } from "@/modules/payments/gateways/types";
import {
  type PaymentCharge,
  updatePendingChargesCancelled,
} from "@/modules/payments/payment-charge.repository";

export function chargeRef(charge: PaymentCharge): GatewayChargeRef {
  return {
    hasQr: charge.qr_content !== null,
    providerRef: charge.provider_ref,
    reference: charge.reference,
  };
}

export async function cancelAtGateway(charges: PaymentCharge[]) {
  await Promise.allSettled(
    charges.map((charge) =>
      getPaymentGateway(charge.gateway)
        .cancelCharge(chargeRef(charge))
        .catch((error) => {
          console.warn("gateway cancel failed", charge.reference, error);
        })
    )
  );
}

// After a payment, a line cancel or a Repair price: a QR still on screen would
// take the old amount. Never fails the change that already went through.
export async function cancelOrderPendingCharges(
  orderId: number,
  { except }: { except?: number } = {}
) {
  try {
    await cancelAtGateway(
      await updatePendingChargesCancelled(orderId, { except })
    );
  } catch (error) {
    console.error("cancelling pending charges failed", orderId, error);
  }
}
