// ADR-0018: no price, no payment — an Order with any live unpriced line
// cannot be marked paid. The gate reads line state only, so the server's paid
// transition and the web's payment controls run the same predicate.

export interface UnpricedLineState {
  price: string | number | null;
  status: string;
}

// A cancelled line took the unpaid off-ramp (ADR-0008): nobody owes its
// number anymore, so its blank price does not hold the rest of the Order's
// payment hostage.
export function isUnpricedLine(line: UnpricedLineState): boolean {
  return line.status !== "cancelled" && line.price === null;
}

export function hasUnpricedLine(lines: UnpricedLineState[]): boolean {
  return lines.some(isUnpricedLine);
}
