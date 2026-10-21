import { findOrderReceipt } from "@/modules/orders/order-read.repository";

// The only staff endpoint that returns pickup_code, since the printed Receipt is
// the Customer's proof (ADR-0016). Keep it apart from getOrderDetailById (ADR-0005).
export async function getOrderReceiptById(id: number) {
  const receipt = await findOrderReceipt(id);

  return receipt ?? null;
}
