export type OrderRefundStatus = "none" | "partial" | "full";

interface DeriveOrderRefundStatusInput {
  paid_amount: string | number | null;
  refunded_amount: string | number | null;
}

export const deriveOrderRefundStatus = ({
  paid_amount,
  refunded_amount,
}: DeriveOrderRefundStatusInput): OrderRefundStatus => {
  const paidAmount = Math.max(Number(paid_amount ?? 0), 0);
  const refundedAmount = Math.max(Number(refunded_amount ?? 0), 0);

  if (refundedAmount <= 0) {
    return "none";
  }

  if (paidAmount > 0 && refundedAmount >= paidAmount) {
    return "full";
  }

  return "partial";
};
