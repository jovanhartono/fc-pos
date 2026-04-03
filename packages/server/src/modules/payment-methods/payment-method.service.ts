import type { InferInsertModel } from "drizzle-orm";
import type { paymentMethodsTable } from "@/db/schema";
import {
  findPaymentMethodById,
  insertPaymentMethod,
  listPaymentMethods,
  updatePaymentMethodById,
} from "@/modules/payment-methods/payment-method.repository";
import type { GetPaymentMethodsQuery } from "@/modules/payment-methods/payment-method.schema";

export function getPaymentMethods(query?: GetPaymentMethodsQuery) {
  return listPaymentMethods({ is_active: query?.is_active });
}

export function getPaymentMethodById(id: number) {
  return findPaymentMethodById(id);
}

export async function createPaymentMethod(
  values: InferInsertModel<typeof paymentMethodsTable>
) {
  const [paymentMethod] = await insertPaymentMethod(values);
  return paymentMethod;
}

export async function updatePaymentMethod(
  id: number,
  values: Partial<InferInsertModel<typeof paymentMethodsTable>>
) {
  const [paymentMethod] = await updatePaymentMethodById(id, values);
  return paymentMethod ?? null;
}
