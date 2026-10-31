import {
  and,
  eq,
  type InferInsertModel,
  type InferSelectModel,
  lt,
  ne,
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

export function findOpenQrisCharge(orderId: number) {
  return db.query.paymentChargesTable.findFirst({
    where: {
      order_id: orderId,
      kind: "qris",
      status: "pending",
      expires_at: { gt: new Date() },
    },
    orderBy: { id: "desc" },
  });
}

// A newer charge the gateway never accepted replaced nothing.
export function findNewerPaymentCharge(orderId: number, id: number) {
  return db.query.paymentChargesTable.findFirst({
    where: { order_id: orderId, id: { gt: id }, status: { ne: "failed" } },
    columns: { kind: true },
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
    columns: { code: true, payment_status: true, status: true },
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

// Every pending charge on the Order, or `only` that one, or all `except` it.
export function updatePendingChargesCancelled(
  orderId: number,
  { only, except }: { only?: number; except?: number } = {}
) {
  return db
    .update(paymentChargesTable)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(paymentChargesTable.order_id, orderId),
        eq(paymentChargesTable.status, "pending"),
        only === undefined ? undefined : eq(paymentChargesTable.id, only),
        except === undefined ? undefined : ne(paymentChargesTable.id, except)
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
