import type { InferInsertModel } from "drizzle-orm";
import { paymentMethodsTable } from "@/db/schema";
import {
  createPaymentMethod,
  findPaymentMethodById,
  listPaymentMethods,
  updatePaymentMethod,
} from "@/modules/payment-methods/payment-method.repository";
import type { GetPaymentMethodsQuery } from "@/modules/payment-methods/payment-method.schema";
import { WhereClauseBuilder } from "@/utils/where-clause-utils";

export function getPaymentMethods(query?: GetPaymentMethodsQuery) {
  const whereClause = new WhereClauseBuilder()
    .addCondition(paymentMethodsTable.is_active, "eq", query?.is_active)
    .build();

  return listPaymentMethods(whereClause);
}

export function getPaymentMethodById(id: number) {
  return findPaymentMethodById(id);
}

export async function createPaymentMethodService(
  values: InferInsertModel<typeof paymentMethodsTable>
) {
  const [paymentMethod] = await createPaymentMethod(values);
  return paymentMethod;
}

export async function updatePaymentMethodService(
  id: number,
  values: Partial<InferInsertModel<typeof paymentMethodsTable>>
) {
  const [paymentMethod] = await updatePaymentMethod(id, values);
  return paymentMethod ?? null;
}
