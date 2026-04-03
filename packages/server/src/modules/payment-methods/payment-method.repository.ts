import type { InferInsertModel } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentMethodsTable } from "@/db/schema";

export function listPaymentMethods(where?: { is_active?: boolean }) {
  return db.query.paymentMethodsTable.findMany({
    orderBy: { id: "asc" },
    where:
      where?.is_active !== undefined
        ? { is_active: where.is_active }
        : undefined,
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
