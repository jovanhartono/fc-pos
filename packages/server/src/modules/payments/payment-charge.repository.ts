import {
  and,
  eq,
  type InferInsertModel,
  type InferSelectModel,
  lt,
  notInArray,
  sql,
} from "drizzle-orm";
import { type DbExecutor, db } from "@/db";
import { paymentChargesTable } from "@/db/schema";
import type { PaymentGatewayName } from "@/modules/payments/gateways/types";

export type PaymentCharge = InferSelectModel<typeof paymentChargesTable>;

const findPaymentChargeByIdPrepared = db.query.paymentChargesTable
  .findFirst({
    where: {
      id: { eq: sql.placeholder("id") },
      order_id: { eq: sql.placeholder("orderId") },
    },
  })
  .prepare("find_payment_charge_by_id");

// The POS polls this every few seconds while a QRIS is on screen.
export function findPaymentChargeById(orderId: number, id: number) {
  return findPaymentChargeByIdPrepared.execute({ id, orderId });
}

const findPaymentChargeByReferencePrepared = db.query.paymentChargesTable
  .findFirst({
    where: { reference: { eq: sql.placeholder("reference") } },
  })
  .prepare("find_payment_charge_by_reference");

export function findPaymentChargeByReference(reference: string) {
  return findPaymentChargeByReferencePrepared.execute({ reference });
}

export function findNewestPendingCheckoutCharge(
  orderId: number,
  gateway: PaymentGatewayName
) {
  return db.query.paymentChargesTable.findFirst({
    where: { order_id: orderId, gateway, kind: "checkout", status: "pending" },
    orderBy: { id: "desc" },
  });
}

export function findOrderForCharge(orderId: number) {
  return db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: { code: true },
    with: { customer: { columns: { name: true, phone_number: true } } },
  });
}

export function findOrderPaymentState(orderId: number) {
  return db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: { code: true, payment_status: true },
    with: { customer: { columns: { name: true } } },
  });
}

export function insertPaymentCharge(
  values: InferInsertModel<typeof paymentChargesTable>
) {
  return db.insert(paymentChargesTable).values(values).returning();
}

export function updatePaymentChargeById(
  id: number,
  values: Partial<InferInsertModel<typeof paymentChargesTable>>
) {
  return db
    .update(paymentChargesTable)
    .set(values)
    .where(eq(paymentChargesTable.id, id))
    .returning();
}

// Pass chargeId to cancel one; leave it out for every pending charge on the Order.
export function updatePendingChargesCancelled(
  orderId: number,
  chargeId?: number
) {
  return db
    .update(paymentChargesTable)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(paymentChargesTable.order_id, orderId),
        eq(paymentChargesTable.status, "pending"),
        chargeId === undefined
          ? undefined
          : eq(paymentChargesTable.id, chargeId)
      )
    )
    .returning();
}

export function updatePendingChargeStatus(
  id: number,
  values: Pick<
    InferInsertModel<typeof paymentChargesTable>,
    "last_payload" | "status"
  >
) {
  return db
    .update(paymentChargesTable)
    .set(values)
    .where(
      and(
        eq(paymentChargesTable.id, id),
        eq(paymentChargesTable.status, "pending")
      )
    );
}

// A paid or needs_review charge is final: a second notification for the same
// money must not move it again.
export function updateUnsettledChargeById(
  executor: DbExecutor,
  id: number,
  values: Partial<InferInsertModel<typeof paymentChargesTable>>
) {
  return executor
    .update(paymentChargesTable)
    .set(values)
    .where(
      and(
        eq(paymentChargesTable.id, id),
        notInArray(paymentChargesTable.status, ["paid", "needs_review"])
      )
    )
    .returning({ id: paymentChargesTable.id });
}

// Wins the right to ask the gateway, at most once per interval per charge.
export function updateChargeStatusCheckedAt(id: number, checkedBefore: Date) {
  return db
    .update(paymentChargesTable)
    .set({ updated_at: new Date() })
    .where(
      and(
        eq(paymentChargesTable.id, id),
        eq(paymentChargesTable.status, "pending"),
        lt(paymentChargesTable.updated_at, checkedBefore)
      )
    )
    .returning({ id: paymentChargesTable.id });
}
