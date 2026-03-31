import type { InferInsertModel } from "drizzle-orm";
import { eq } from "drizzle-orm";
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

export function findPaymentMethodById(id: number) {
  return db.query.paymentMethodsTable.findFirst({
    where: { id },
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
