import type { InferInsertModel } from "drizzle-orm";
import { EmptyFilter, eq, sql } from "drizzle-orm";
import { type DbExecutor, db } from "@/db";
import { paymentMethodsTable } from "@/db/schema";
import type { PaymentGatewayName } from "@/modules/payments/gateways/types";

export function listPaymentMethods(where?: { is_active?: boolean }) {
  return db.query.paymentMethodsTable.findMany({
    orderBy: { id: "asc" },
    where: { is_active: where?.is_active ?? EmptyFilter },
  });
}

const findPaymentMethodByIdPrepared = db.query.paymentMethodsTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_payment_method_by_id");

export function findPaymentMethodById(id: number) {
  return findPaymentMethodByIdPrepared.execute({ id });
}

// Active or not: money a gateway already took still books to its PaymentMethod.
export function findPaymentMethodByGateway(
  gateway: PaymentGatewayName,
  executor: DbExecutor = db
) {
  return executor.query.paymentMethodsTable.findFirst({ where: { gateway } });
}

export function insertPaymentMethod(
  values: InferInsertModel<typeof paymentMethodsTable>
) {
  return db.insert(paymentMethodsTable).values(values).returning();
}

export function updatePaymentMethodById(
  id: number,
  values: Partial<InferInsertModel<typeof paymentMethodsTable>>
) {
  return db
    .update(paymentMethodsTable)
    .set(values)
    .where(eq(paymentMethodsTable.id, id))
    .returning();
}
