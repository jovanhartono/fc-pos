// ADR-0019: a Campaign's eligibility base and its minimum-total base are both
// the fixed-price subtotal — catalog-priced lines only. A no-list-price line
// (Repair) can be re-priced after checkout, so a discount that depended on it
// could be invalidated after its voucher code was already burned. The rule
// keys on the Service having no list price, never on the line being an
// Estimate — otherwise the same Repair would swing a Campaign in or out
// depending on how confident the cashier felt.

export interface FixedPriceLine {
  has_list_price: boolean;
  subtotal: number;
}

// Server truth (order.service.ts) and POS preview (useCheckoutPricing) both
// compute the campaign base through here, so the POS can never preview a
// discount that checkout then rejects.
export function fixedPriceSubtotal(lines: FixedPriceLine[]): number {
  return lines.reduce(
    (sum, line) => (line.has_list_price ? sum + line.subtotal : sum),
    0
  );
}
