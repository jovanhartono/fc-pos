import { BadRequestException } from "@/http-exceptions";
import {
  type BogoSlotLine,
  bogoFreeCount,
  type CampaignDiscountInput,
  isBogoSlot,
} from "@/schema/discount";

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

export interface DiscountShareLine {
  // Null unless a Buy N Get M can count this line.
  bogoServiceId: number | null;
  // What the Customer is billed for the line: 0 once cancelled.
  gross: number;
  key: string;
}

export interface BogoDiscount
  extends Pick<CampaignDiscountInput, "buy_quantity" | "free_quantity"> {
  amount: number;
  eligibleServiceIds: number[];
}

interface PoolLine {
  // Below 1 when same-priced lines spill past the last group and share it.
  fraction: number;
  line: DiscountShareLine;
}

// Only lines that fill a whole group earned the free ones, cheapest first as
// at checkout (ADR-0007).
function groupedLines(
  pool: DiscountShareLine[],
  bogo: BogoDiscount
): PoolLine[] {
  const freeCount = bogoFreeCount(bogo, pool.length);
  // Less than a group left after a cancellation: the free amount stays here.
  if (freeCount === 0) {
    return pool.map((line) => ({ fraction: 1, line }));
  }
  const filled =
    (freeCount / (bogo.free_quantity ?? 1)) *
    ((bogo.buy_quantity ?? 0) + (bogo.free_quantity ?? 0));
  const sorted = [...pool].sort((a, b) => a.gross - b.gross);
  const cut = sorted[filled - 1].gross;
  const below = sorted.filter((line) => line.gross < cut);
  const atCut = sorted.filter((line) => line.gross === cut);
  const share = (filled - below.length) / atCut.length;

  return [
    ...below.map((line) => ({ fraction: 1, line })),
    ...atCut.map((line) => ({ fraction: share, line })),
  ];
}

// A free DCS from "Pay 4 Get 1" was earned by the DCS lines alone, so
// refunding a Hard Stain on the same Order returns its full price. Whatever
// discount is left (manual, fixed, %) spreads over the whole Order.
export function lineDiscountShares({
  bogoDiscounts,
  lines,
  orderDiscount,
}: {
  bogoDiscounts: BogoDiscount[];
  lines: DiscountShareLine[];
  orderDiscount: number;
}): Map<string, number> {
  const shares = new Map(lines.map((line) => [line.key, 0]));
  // Weighed by what each line has left, so no line carries more than its
  // price, and a % taken after a free Service lands where checkout took it.
  const spread = (budget: number, pool: PoolLine[]) => {
    const room = pool.map(
      ({ fraction, line }) =>
        fraction * (line.gross - (shares.get(line.key) ?? 0))
    );
    const poolRoom = room.reduce((sum, value) => sum + value, 0);
    const amount = Math.min(budget, poolRoom);
    if (amount <= 0) {
      return 0;
    }
    pool.forEach(({ line }, index) => {
      shares.set(
        line.key,
        (shares.get(line.key) ?? 0) + (room[index] / poolRoom) * amount
      );
    });
    return amount;
  };

  let left = orderDiscount;
  for (const bogo of bogoDiscounts) {
    const eligible = new Set(bogo.eligibleServiceIds);
    const pool = lines.filter(
      (line) => line.bogoServiceId !== null && eligible.has(line.bogoServiceId)
    );
    left -= spread(Math.min(bogo.amount, left), groupedLines(pool, bogo));
  }
  spread(
    left,
    lines.map((line) => ({ fraction: 1, line }))
  );
  return shares;
}

// How much of a line is still refundable: the line's gross minus its share
// of the order discount, minus what was already refunded.
export function lineRefundCap({
  alreadyRefunded,
  discountShare,
  grossLine,
}: {
  alreadyRefunded: number;
  discountShare: number;
  grossLine: number;
}) {
  return Math.max(0, grossLine - discountShare - alreadyRefunded);
}

type Money = string | null;

interface RefundCapServiceRow extends BogoSlotLine {
  id: number;
  service_id: number | null;
  subtotal: Money;
}

interface RefundCapProductRow {
  cancelled_at: unknown;
  id: number;
  refunded_at: unknown;
  subtotal: Money;
}

interface RefundCapCampaignRow {
  applied_amount: Money;
  buy_quantity: number | null;
  campaign: { eligibleServices: { service_id: number }[] };
  discount_type: string;
  free_quantity: number | null;
}

// The server books refunds and the Refund dialog previews them from this one
// function, so the cashier never sees an amount the server won't pay out.
export function orderLineRefundCaps({
  campaigns,
  discount,
  products,
  refundedByLineKey,
  services,
}: {
  campaigns: RefundCapCampaignRow[];
  discount: Money;
  products: RefundCapProductRow[];
  refundedByLineKey: Map<string, number>;
  services: RefundCapServiceRow[];
}): Map<string, number> {
  const lines = [
    ...services.map((row) => ({
      bogoServiceId: isBogoSlot(row) ? (row.service_id ?? null) : null,
      gross: row.status === "cancelled" ? 0 : Number(row.subtotal ?? 0),
      key: lineKey("service", row.id),
      isClosed: false,
    })),
    ...products.map((row) => ({
      bogoServiceId: null,
      gross: row.cancelled_at ? 0 : Number(row.subtotal ?? 0),
      key: lineKey("product", row.id),
      // Rounding can leave a few rupiah after a whole-line refund; a product
      // refunded or cancelled (ADR-0008) is never refundable again.
      isClosed: Boolean(row.refunded_at || row.cancelled_at),
    })),
  ];

  const shares = lineDiscountShares({
    bogoDiscounts: campaigns
      .filter((row) => row.discount_type === "buy_n_get_m_free")
      .map((row) => ({
        amount: Number(row.applied_amount ?? 0),
        eligibleServiceIds: row.campaign.eligibleServices.map(
          (eligible) => eligible.service_id
        ),
        buy_quantity: row.buy_quantity,
        free_quantity: row.free_quantity,
      })),
    lines,
    orderDiscount: Number(discount ?? 0),
  });

  return new Map(
    lines.map((line) => [
      line.key,
      line.isClosed
        ? 0
        : lineRefundCap({
            alreadyRefunded: refundedByLineKey.get(line.key) ?? 0,
            discountShare: shares.get(line.key) ?? 0,
            grossLine: line.gross,
          }),
    ])
  );
}

// Whole rupiah per line: floor each cap, then hand the leftover to the largest
// remainders (ties: kind, then lower id) so the lines sum to the rounded total.
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
