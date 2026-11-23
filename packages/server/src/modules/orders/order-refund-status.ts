export type OrderRefundStatus = "none" | "partial" | "full";

interface DeriveOrderRefundStatusInput {
  delivery_fee: string | number | null;
  paid_amount: string | number | null;
  refunded_amount: string | number | null;
}

// A Refund never returns the Delivery fee (ADR-0029): the most a Customer can
// ever get back is what they paid for the Lines.
export const refundableAmount = ({
  delivery_fee,
  paid_amount,
}: Omit<DeriveOrderRefundStatusInput, "refunded_amount">): number =>
  Math.max(Number(paid_amount ?? 0) - Number(delivery_fee ?? 0), 0);

// Refunding every Line is a full refund even though the fee stays with the shop.
export const deriveOrderRefundStatus = (
  input: DeriveOrderRefundStatusInput
): OrderRefundStatus => {
  const refundable = refundableAmount(input);
  const refundedAmount = Math.max(Number(input.refunded_amount ?? 0), 0);

  if (refundedAmount <= 0) {
    return "none";
  }

  if (refundable > 0 && refundedAmount >= refundable) {
    return "full";
  }

  return "partial";
};
