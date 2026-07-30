import { BadRequestException } from "@/errors";

export type RefundLineKind = "service" | "product";

export interface RefundLineRef {
  id: number;
  kind: RefundLineKind;
}

export function lineKey(kind: RefundLineKind, id: number) {
  return `${kind}:${id}`;
}

function roundCurrencyUnit(value: number) {
  return Math.round(value);
}

// How much of a line is still refundable: the line's gross minus its
// prorated share of the order discount, minus what was already refunded.
export function lineRefundCap({
  alreadyRefunded,
  grossLine,
  grossTotal,
  orderDiscount,
}: {
  alreadyRefunded: number;
  grossLine: number;
  grossTotal: number;
  orderDiscount: number;
}) {
  const allocatedDiscount =
    grossTotal > 0 ? (grossLine / grossTotal) * orderDiscount : 0;
  const refundableGross = Math.max(0, grossLine - allocatedDiscount);

  return Math.max(0, refundableGross - alreadyRefunded);
}

// Allocate each line's remaining cap as whole rupiah. Fractional caps are
// floored, then the rounded grand total's leftover units are handed out by
// largest remainder (ties: kind, then lower id — deterministic) so the
// amounts always sum to the rounded total.
export function allocateRefund<T extends RefundLineRef>({
  capsByLineKey,
  lines,
}: {
  capsByLineKey: Map<string, number>;
  lines: T[];
}): (T & { amount: number })[] {
  const refundItems = lines.map((line) => {
    const maxRefundable = capsByLineKey.get(lineKey(line.kind, line.id)) ?? 0;
    if (maxRefundable <= 0) {
      throw new BadRequestException(
        `Order ${line.kind} ${line.id} has no refundable amount remaining`
      );
    }

    return {
      ...line,
      amount: Math.floor(maxRefundable),
      preciseAmount: maxRefundable,
    };
  });

  const roundedTotalRefundAmount = roundCurrencyUnit(
    refundItems.reduce((sum, item) => sum + item.preciseAmount, 0)
  );

  let remainingWholeUnits =
    roundedTotalRefundAmount -
    refundItems.reduce((sum, item) => sum + item.amount, 0);

  const itemsByLargestRemainder = [...refundItems].sort((left, right) => {
    const remainderDiff =
      right.preciseAmount - right.amount - (left.preciseAmount - left.amount);

    if (remainderDiff !== 0) {
      return remainderDiff;
    }

    return left.kind === right.kind
      ? left.id - right.id
      : left.kind.localeCompare(right.kind);
  });

  for (const item of itemsByLargestRemainder) {
    if (remainingWholeUnits <= 0) {
      break;
    }

    item.amount += 1;
    remainingWholeUnits -= 1;
  }

  if (remainingWholeUnits > 0) {
    throw new BadRequestException(
      "Refund amount could not be allocated across the selected refund lines"
    );
  }

  return refundItems.map(
    ({ preciseAmount, ...item }) => item as T & { amount: number }
  );
}
