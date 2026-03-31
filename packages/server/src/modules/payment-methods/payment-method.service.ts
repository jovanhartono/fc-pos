import type { InferInsertModel } from "drizzle-orm";
import type { paymentMethodsTable } from "@/db/schema";
import {
  createPaymentMethod,
  findPaymentMethodById,
  listPaymentMethods,
  updatePaymentMethod,
} from "@/modules/payment-methods/payment-method.repository";
import type { GetPaymentMethodsQuery } from "@/modules/payment-methods/payment-method.schema";

export function getPaymentMethods(query?: GetPaymentMethodsQuery) {
  return listPaymentMethods({ is_active: query?.is_active });
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
