import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderRefundItemsTable,
  orderRefundsTable,
  ordersTable,
} from "@/db/schema";
import { BadRequestException } from "@/errors";
import type {
  PostOrderCancelInput,
  PostOrderRefundInput,
} from "@/modules/orders/order-admin.schema";
import {
  applyRefundTransition,
  isTerminalOrderServiceStatus,
  transitionOrderService,
} from "@/modules/orders/order-status-machine";
import {
  assertCanCancelOrderService,
  assertCanRefundOrderService,
} from "@/modules/permissions/permissions";
import type { JWTPayload } from "@/types";

function roundCurrencyUnit(value: number) {
  return Math.round(value);
}

function buildRefundItems({
  capsByServiceId,
  items,
}: {
  capsByServiceId: Map<number, number>;
  items: PostOrderRefundInput["items"];
}) {
  const refundItems = items.map((item) => {
    const maxRefundable = capsByServiceId.get(item.order_service_id) ?? 0;
    if (maxRefundable <= 0) {
      throw new BadRequestException(
        `Order service ${item.order_service_id} has no refundable amount remaining`
      );
    }

    return {
      ...item,
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

    return remainderDiff === 0
      ? left.order_service_id - right.order_service_id
      : remainderDiff;
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
      "Refund amount could not be allocated across the selected services"
    );
  }

  return refundItems.map(({ preciseAmount, ...item }) => item);
}

async function getOrderLineRefundCaps(orderId: number) {
  const [order, serviceRows, refundedRows] = await Promise.all([
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
    db
      .select({
        order_service_id: orderRefundItemsTable.order_service_id,
        refunded_total: sql<string>`COALESCE(SUM(${orderRefundItemsTable.amount}), 0)`,
      })
      .from(orderRefundItemsTable)
      .innerJoin(
        orderRefundsTable,
        eq(orderRefundItemsTable.order_refund_id, orderRefundsTable.id)
      )
      .where(eq(orderRefundsTable.order_id, orderId))
      .groupBy(orderRefundItemsTable.order_service_id),
  ]);

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  const grossTotal = Number(order.total ?? 0);
  const orderDiscount = Number(order.discount);

  const refundedByServiceId = new Map(
    refundedRows.map((row) => [
      row.order_service_id,
      Number(row.refunded_total),
    ])
  );

  return serviceRows.map((row) => {
    const grossLine = Number(row.subtotal ?? 0);
    const allocatedDiscount =
      grossTotal > 0 ? (grossLine / grossTotal) * orderDiscount : 0;
    const refundableGross = Math.max(0, grossLine - allocatedDiscount);
    const alreadyRefunded = refundedByServiceId.get(row.id) ?? 0;

    return {
      maxRefundable: Math.max(0, refundableGross - alreadyRefunded),
      order_service_id: row.id,
    };
  });
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
  const uniqueServiceIds = [
    ...new Set(body.items.map((item) => item.order_service_id)),
  ];
  if (uniqueServiceIds.length !== body.items.length) {
    throw new BadRequestException(
      "Duplicate order_service_id entries are not allowed"
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

  const refundCaps = await getOrderLineRefundCaps(orderId);
  const capsByServiceId = new Map(
    refundCaps.map((item) => [item.order_service_id, item.maxRefundable])
  );

  const refundItems = buildRefundItems({
    capsByServiceId,
    items: body.items,
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
        note: body.note,
      })
      .returning();

    await tx.insert(orderRefundItemsTable).values(
      refundItems.map((item) => ({
        order_refund_id: createdRefund.id,
        order_service_id: item.order_service_id,
        amount: item.amount.toString(),
        reason: item.reason,
        note: item.note,
      }))
    );

    await applyRefundTransition(tx, {
      orderId,
      by: user.id,
      items: refundItems.map((item) => ({
        serviceId: item.order_service_id,
        note: item.note,
      })),
    });

    return [createdRefund] as const;
  });

  return {
    refund,
    total_refund_amount: totalRefundAmount,
  };
}

export async function cancelOrder({
  orderId,
  body,
  user,
}: {
  orderId: number;
  body: PostOrderCancelInput;
  user: JWTPayload;
}) {
  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: {
      id: true,
      status: true,
      payment_status: true,
    },
  });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  assertCanCancelOrderService(user, order);

  if (order.status === "cancelled") {
    throw new BadRequestException("Order is already cancelled");
  }

  const allServices = await db.query.ordersServicesTable.findMany({
    where: { order_id: orderId },
    columns: { id: true, status: true },
  });

  const cancellableServices = allServices.filter(
    (service) => !isTerminalOrderServiceStatus(service.status)
  );

  if (cancellableServices.length === 0) {
    throw new BadRequestException("No cancellable services on this order");
  }

  const cancelReason = body.cancel_reason;
  const cancelNote = body.cancel_note?.trim() || null;
  const cancellableIds = cancellableServices.map((service) => service.id);

  await db.transaction(async (tx) => {
    for (const service of cancellableServices) {
      await transitionOrderService(tx, {
        orderId,
        serviceId: service.id,
        to: "cancelled",
        by: user.id,
        cancelReason,
        cancelNote,
        note: cancelNote ?? cancelReason,
      });
    }

    await tx
      .update(ordersTable)
      .set({
        cancelled_at: new Date(),
        updated_by: user.id,
      })
      .where(eq(ordersTable.id, orderId));
  });

  return {
    cancelled_service_ids: cancellableIds,
    order_id: orderId,
  };
}
