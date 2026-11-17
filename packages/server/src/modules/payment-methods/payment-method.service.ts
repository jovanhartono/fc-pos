import type { InferInsertModel } from "drizzle-orm";

import type { paymentMethodsTable } from "@/db/schema";
import {
  findPaymentMethodById,
  insertPaymentMethod,
  listPaymentMethods,
  updatePaymentMethodById,
} from "@/modules/payment-methods/payment-method.repository";
import type { GetPaymentMethodsQuery } from "@/modules/payment-methods/payment-method.schema";

export const getPaymentMethods = (query?: GetPaymentMethodsQuery) =>
  listPaymentMethods({ is_active: query?.is_active });

export const getPaymentMethodById = (id: number) => findPaymentMethodById(id);

export const createPaymentMethod = async (
  values: InferInsertModel<typeof paymentMethodsTable>
) => {
  const [paymentMethod] = await insertPaymentMethod(values);
  return paymentMethod;
};

export const updatePaymentMethod = async (
  id: number,
  values: Partial<InferInsertModel<typeof paymentMethodsTable>>
) => {
  const [paymentMethod] = await updatePaymentMethodById(id, values);
  return paymentMethod ?? null;
};
