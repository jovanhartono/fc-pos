import type { InferInsertModel } from "drizzle-orm";
import type { paymentMethodsTable } from "@/db/schema";
import type { GetPaymentMethodsQuery } from "@/modules/payment-methods/payment-method.schema";
import {
  createPaymentMethodService,
  getPaymentMethodById,
  getPaymentMethods,
  updatePaymentMethodService,
} from "@/modules/payment-methods/payment-method.service";

export function getPaymentMethodsController(query?: GetPaymentMethodsQuery) {
  return getPaymentMethods(query);
}

export function getPaymentMethodByIdController(id: number) {
  return getPaymentMethodById(id);
}

export function createPaymentMethodController(
  values: InferInsertModel<typeof paymentMethodsTable>
) {
  return createPaymentMethodService(values);
}

export function updatePaymentMethodController(
  id: number,
  values: Partial<InferInsertModel<typeof paymentMethodsTable>>
) {
  return updatePaymentMethodService(id, values);
}
