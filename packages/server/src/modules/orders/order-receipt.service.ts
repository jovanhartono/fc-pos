import { findOrderReceipt } from "@/modules/orders/order-read.repository";

// The single admin surface allowed to return pickup_code (ADR-0016: the
// printed receipt is the claim ticket). Keep this read separate from
// getOrderDetailById, which deliberately strips the code (ADR-0005).
export async function getOrderReceiptById(id: number) {
  const receipt = await findOrderReceipt(id);

  return receipt ?? null;
}
