import type { InferInsertModel } from "drizzle-orm";
import { EmptyFilter, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import type { DbExecutor } from "@/db";
import { paymentMethodsTable } from "@/db/schema";
import type { PaymentGatewayName } from "@/modules/payments/gateways/types";

export const listPaymentMethods = (where?: { is_active?: boolean }) =>
  db.query.paymentMethodsTable.findMany({
    orderBy: { id: "asc" },
    where: { is_active: where?.is_active ?? EmptyFilter },
  });

const findPaymentMethodByIdPrepared = db.query.paymentMethodsTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_payment_method_by_id");

export const findPaymentMethodById = (id: number) =>
  findPaymentMethodByIdPrepared.execute({ id });

// Active or not: money a gateway already took still books to its PaymentMethod.
export const findPaymentMethodByGateway = (
  gateway: PaymentGatewayName,
  executor: DbExecutor = db
) => executor.query.paymentMethodsTable.findFirst({ where: { gateway } });

export const insertPaymentMethod = (
  values: InferInsertModel<typeof paymentMethodsTable>
) => db.insert(paymentMethodsTable).values(values).returning();

export const updatePaymentMethodById = (
  id: number,
  values: Partial<InferInsertModel<typeof paymentMethodsTable>>
) =>
  db
    .update(paymentMethodsTable)
    .set(values)
    .where(eq(paymentMethodsTable.id, id))
    .returning();
