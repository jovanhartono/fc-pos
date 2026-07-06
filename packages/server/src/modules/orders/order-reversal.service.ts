import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderRefundItemsTable,
  orderRefundsTable,
  ordersProductsTable,
  ordersTable,
} from "@/db/schema";
import { BadRequestException } from "@/errors";
import {
  decrementCampaignRedeemed,
  findOrderCampaignsByOrderId,
  releaseCampaignCodeRedemption,
} from "@/modules/campaigns/campaign.repository";
import type { OrderTx } from "@/modules/orders/order.repository";
import type {
  PostOrderCancelInput,
  PostOrderRefundInput,
} from "@/modules/orders/order-admin.schema";
import {
  applyRefundTransition,
  recomputeOrderRollup,
  transitionOrderService,
} from "@/modules/orders/order-status-machine";
import {
  assertCanCancelOrderService,
  assertCanRefundOrderService,
} from "@/modules/permissions/permissions";
import { incrementProductStock } from "@/modules/products/product.repository";
import type { JWTPayload } from "@/types";

function roundCurrencyUnit(value: number) {
  return Math.round(value);
}

type RefundLineInput = PostOrderRefundInput["items"][number];
type RefundLineKind = "service" | "product";

interface RefundLine {
  id: number;
  kind: RefundLineKind;
  note?: string;
  reason: RefundLineInput["reason"];
}

function lineKey(kind: RefundLineKind, id: number) {
  return `${kind}:${id}`;
}

function toRefundLine(item: RefundLineInput): RefundLine {
  if (item.order_service_id != null) {
    return {
      kind: "service",
      id: item.order_service_id,
      note: item.note,
      reason: item.reason,
    };
  }
  if (item.order_product_id != null) {
    return {
      kind: "product",
      id: item.order_product_id,
      note: item.note,
      reason: item.reason,
    };
  }
  throw new BadRequestException(
    "Each refund item must reference a service or product line"
  );
}

function buildRefundItems({
  capsByLineKey,
  lines,
}: {
  capsByLineKey: Map<string, number>;
  lines: RefundLine[];
}) {
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

  return refundItems.map(({ preciseAmount, ...item }) => item);
}

async function getOrderLineRefundCaps(orderId: number) {
  const [order, serviceRows, productRows, refundedRows] = await Promise.all([
    db.query.ordersTable.findFirst({
      where: { id: orderId },
      columns: {
        id: true,
        total: true,
        discount: true,
      },
    }),
    db.query.ordersServicesTable.findMany({
      where: { order_id: orderId },
      columns: {
        id: true,
        subtotal: true,
      },
    }),
    db.query.ordersProductsTable.findMany({
      where: { order_id: orderId },
      columns: {
        id: true,
        refunded_at: true,
        cancelled_at: true,
        subtotal: true,
      },
    }),
    db
      .select({
        order_product_id: orderRefundItemsTable.order_product_id,
        order_service_id: orderRefundItemsTable.order_service_id,
        refunded_total: sql<string>`COALESCE(SUM(${orderRefundItemsTable.amount}), 0)`,
      })
      .from(orderRefundItemsTable)
      .innerJoin(
        orderRefundsTable,
        eq(orderRefundItemsTable.order_refund_id, orderRefundsTable.id)
      )
      .where(eq(orderRefundsTable.order_id, orderId))
      .groupBy(
        orderRefundItemsTable.order_service_id,
        orderRefundItemsTable.order_product_id
      ),
  ]);

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  const grossTotal = Number(order.total ?? 0);
  const orderDiscount = Number(order.discount);

  const refundedByLineKey = new Map(
    refundedRows.map((row) => [
      row.order_service_id == null
        ? lineKey("product", row.order_product_id ?? 0)
        : lineKey("service", row.order_service_id),
      Number(row.refunded_total),
    ])
  );

  const lineCap = (key: string, subtotal: string | null) => {
    const grossLine = Number(subtotal ?? 0);
    const allocatedDiscount =
      grossTotal > 0 ? (grossLine / grossTotal) * orderDiscount : 0;
    const refundableGross = Math.max(0, grossLine - allocatedDiscount);
    const alreadyRefunded = refundedByLineKey.get(key) ?? 0;

    return Math.max(0, refundableGross - alreadyRefunded);
  };

  return new Map<string, number>([
    ...serviceRows.map((row): [string, number] => {
      const key = lineKey("service", row.id);
      return [key, lineCap(key, row.subtotal)];
    }),
    ...productRows.map((row): [string, number] => {
      const key = lineKey("product", row.id);
      // rounding residue can leave a fractional cap after a whole-line refund;
      // refunded_at/cancelled_at are authoritative — a line that already took an
      // off-ramp (refund or unpaid cancel, ADR-0008) is never refundable again
      return [
        key,
        row.refunded_at || row.cancelled_at ? 0 : lineCap(key, row.subtotal),
      ];
    }),
  ]);
}

export async function createOrderRefund({
  orderId,
  body,
  user,
}: {
  orderId: number;
  body: PostOrderRefundInput;
  user: JWTPayload;
}) {
  const lines = body.items.map(toRefundLine);

  const uniqueLineKeys = new Set(
    lines.map((line) => lineKey(line.kind, line.id))
  );
  if (uniqueLineKeys.size !== lines.length) {
    throw new BadRequestException(
      "Duplicate refund line entries are not allowed"
    );
  }

  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: {
      id: true,
      payment_status: true,
      paid_amount: true,
      refunded_amount: true,
    },
  });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  assertCanRefundOrderService(user, order);

  const capsByLineKey = await getOrderLineRefundCaps(orderId);

  const refundItems = buildRefundItems({
    capsByLineKey,
    lines,
  });

  const totalRefundAmount = refundItems.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const refundablePaidAmount =
    Number(order.paid_amount) - Number(order.refunded_amount);
  if (totalRefundAmount > refundablePaidAmount) {
    throw new BadRequestException(
      "Refund exceeds remaining paid amount for this order"
    );
  }

  const [refund] = await db.transaction(async (tx) => {
    await tx
      .update(ordersTable)
      .set({
        refunded_amount: sql`${ordersTable.refunded_amount} + ${totalRefundAmount}`,
        updated_by: user.id,
      })
      .where(eq(ordersTable.id, orderId));

    const [createdRefund] = await tx
      .insert(orderRefundsTable)
      .values({
        order_id: orderId,
        refunded_by: user.id,
        total_amount: totalRefundAmount.toString(),
      })
      .returning();

    await tx.insert(orderRefundItemsTable).values(
      refundItems.map((item) => ({
        order_refund_id: createdRefund.id,
        order_service_id: item.kind === "service" ? item.id : null,
        order_product_id: item.kind === "product" ? item.id : null,
        amount: item.amount.toString(),
        reason: item.reason,
        note: item.note,
      }))
    );

    const refundedProductIds = refundItems
      .filter((item) => item.kind === "product")
      .map((item) => item.id);

    if (refundedProductIds.length > 0) {
      await tx
        .update(ordersProductsTable)
        .set({ refunded_at: new Date() })
        .where(inArray(ordersProductsTable.id, refundedProductIds));
    }

    const serviceItems = refundItems
      .filter((item) => item.kind === "service")
      .map((item) => ({ serviceId: item.id, note: item.note }));

    if (serviceItems.length > 0) {
      await applyRefundTransition(tx, {
        orderId,
        by: user.id,
        items: serviceItems,
      });
    }

    return [createdRefund] as const;
  });

  return {
    refund,
    total_refund_amount: totalRefundAmount,
  };
}

type CancelLineInput = PostOrderCancelInput["items"][number];

interface CancelLine {
  id: number;
  kind: RefundLineKind;
  note?: string;
  reason: CancelLineInput["reason"];
}

function toCancelLine(item: CancelLineInput): CancelLine {
  if (item.order_service_id != null) {
    return {
      kind: "service",
      id: item.order_service_id,
      note: item.note,
      reason: item.reason,
    };
  }
  if (item.order_product_id != null) {
    return {
      kind: "product",
      id: item.order_product_id,
      note: item.note,
      reason: item.reason,
    };
  }
  throw new BadRequestException(
    "Each cancel item must reference a service or product line"
  );
}

// Release each redemption logged on the order (ADR-0015): a code redemption is
// unclaimed (redeemed_at/redeemed_order_id nulled), a listed redemption
// decrements the campaign's redeemed_count. Only called when a full cancel
// closes the order.
async function releaseCampaignRedemptions(tx: OrderTx, orderId: number) {
  const orderCampaigns = await findOrderCampaignsByOrderId(tx, orderId);
  for (const oc of orderCampaigns) {
    if (oc.code_id === null) {
      await decrementCampaignRedeemed(tx, oc.campaign_id);
    } else {
      await releaseCampaignCodeRedemption(tx, oc.code_id);
    }
  }
}

interface CancelProductRow {
  cancelled_at: Date | null;
  id: number;
  product_id: number | null;
  qty: number;
  refunded_at: Date | null;
}

// Void the given product lines inside the cancel transaction. CAS on the still-
// open markers (mirrors transitionOrderService): only one concurrent cancel
// wins, so stock is restored exactly once.
async function cancelProductLines(
  tx: OrderTx,
  productLines: CancelLine[],
  productRowById: Map<number, CancelProductRow>
) {
  for (const line of productLines) {
    const row = productRowById.get(line.id);
    if (!row) {
      continue;
    }
    const updated = await tx
      .update(ordersProductsTable)
      .set({
        cancelled_at: new Date(),
        cancel_reason: line.reason,
        cancel_note: line.note ?? null,
      })
      .where(
        and(
          eq(ordersProductsTable.id, line.id),
          isNull(ordersProductsTable.cancelled_at),
          isNull(ordersProductsTable.refunded_at)
        )
      )
      .returning({ id: ordersProductsTable.id });
    if (updated.length === 0) {
      throw new BadRequestException(
        `Product line ${line.id} was already cancelled or refunded`
      );
    }
    if (row.product_id != null) {
      await incrementProductStock(tx, row.product_id, row.qty);
    }
  }
}

// Cancel is the unpaid, per-line twin of refund (ADR-0008): staff pick which
// service and product lines to void. No money moves; cancelled product lines
// restore stock. The Order rollup is recomputed from the resulting line states.
export async function cancelOrder({
  orderId,
  body,
  user,
}: {
  orderId: number;
  body: PostOrderCancelInput;
  user: JWTPayload;
}) {
  const lines = body.items.map(toCancelLine);

  const uniqueLineKeys = new Set(
    lines.map((line) => lineKey(line.kind, line.id))
  );
  if (uniqueLineKeys.size !== lines.length) {
    throw new BadRequestException(
      "Duplicate cancel line entries are not allowed"
    );
  }

  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: { id: true, status: true, payment_status: true },
  });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  assertCanCancelOrderService(user, order);

  const serviceLines = lines.filter((line) => line.kind === "service");
  const productLines = lines.filter((line) => line.kind === "product");

  const productRows =
    productLines.length > 0
      ? await db.query.ordersProductsTable.findMany({
          where: {
            order_id: orderId,
            id: { in: productLines.map((l) => l.id) },
          },
          columns: {
            id: true,
            qty: true,
            product_id: true,
            refunded_at: true,
            cancelled_at: true,
          },
        })
      : [];
  const productRowById = new Map(productRows.map((row) => [row.id, row]));

  for (const line of productLines) {
    const row = productRowById.get(line.id);
    if (!row) {
      throw new BadRequestException(
        `Product line ${line.id} not found on this order`
      );
    }
    if (row.cancelled_at) {
      throw new BadRequestException(
        `Product line ${line.id} is already cancelled`
      );
    }
    if (row.refunded_at) {
      throw new BadRequestException(
        `Product line ${line.id} is refunded and cannot be cancelled`
      );
    }
  }

  await db.transaction(async (tx) => {
    for (const line of serviceLines) {
      await transitionOrderService(tx, {
        orderId,
        serviceId: line.id,
        to: "cancelled",
        by: user.id,
        cancelReason: line.reason,
        cancelNote: line.note ?? null,
        note: line.note ?? line.reason,
      });
    }

    await cancelProductLines(tx, productLines, productRowById);

    // Service cancels recompute inside transitionOrderService; product-only
    // cancels need an explicit recompute to fold product states into the rollup.
    if (productLines.length > 0) {
      await recomputeOrderRollup(tx, orderId, user.id);
    }

    // Release campaign redemptions if this cancel fully closed the order
    // (ADR-0015). Gate on the pre-loaded status: avoids double-release when
    // re-cancelling an already-cancelled order. Single site covers both
    // service-only and product cancels.
    if (order.status !== "cancelled") {
      const updated = await tx.query.ordersTable.findFirst({
        where: { id: orderId },
        columns: { status: true },
      });
      if (updated?.status === "cancelled") {
        await releaseCampaignRedemptions(tx, orderId);
      }
    }
  });

  return {
    cancelled_service_ids: serviceLines.map((line) => line.id),
    cancelled_product_ids: productLines.map((line) => line.id),
    order_id: orderId,
  };
}
