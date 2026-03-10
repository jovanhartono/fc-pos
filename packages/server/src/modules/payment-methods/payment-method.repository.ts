import type { InferInsertModel } from "drizzle-orm";
import { asc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { paymentMethodsTable } from "@/db/schema";

export function listPaymentMethods(whereClause?: SQL) {
  return db.query.paymentMethodsTable.findMany({
    orderBy: [asc(paymentMethodsTable.id)],
    where: whereClause,
  });
}

export function findPaymentMethodById(id: number) {
  return db.query.paymentMethodsTable.findFirst({
    where: eq(paymentMethodsTable.id, id),
  });
}

export function createPaymentMethod(
  values: InferInsertModel<typeof paymentMethodsTable>
) {
  return db.insert(paymentMethodsTable).values(values).returning();
}

export function updatePaymentMethod(
  id: number,
  values: Partial<InferInsertModel<typeof paymentMethodsTable>>
) {
  return db
    .update(paymentMethodsTable)
    .set(values)
    .where(eq(paymentMethodsTable.id, id))
    .returning();
}
