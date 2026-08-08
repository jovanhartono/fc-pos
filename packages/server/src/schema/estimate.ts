// ADR-0018: an Order carrying any unconfirmed Estimate cannot be marked paid.
// The gate reads line state only, so the server's paid transition and the
// web's payment controls run the same predicate.

export interface EstimateLineState {
  estimate_confirmed_at: Date | string | null;
  estimated_price: string | number | null;
  status: string;
}

// A cancelled line took the unpaid off-ramp (ADR-0008): its unsettled number
// is out of the money and can no longer move what the customer owes, so it
// does not hold the rest of the Order's payment hostage.
export function isUnconfirmedEstimate(line: EstimateLineState): boolean {
  return (
    line.status !== "cancelled" &&
    line.estimated_price !== null &&
    line.estimate_confirmed_at === null
  );
}

export function hasUnconfirmedEstimate(lines: EstimateLineState[]): boolean {
  return lines.some(isUnconfirmedEstimate);
}
