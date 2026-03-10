import type { InferInsertModel, SQL } from "drizzle-orm";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customersTable } from "@/db/schema";

export function listCustomers({
  limit,
  offset,
  whereClause,
}: {
  limit: number;
  offset: number;
  whereClause?: SQL<unknown>;
}) {
  return db.query.customersTable.findMany({
    orderBy: [asc(customersTable.id)],
    limit,
    offset,
    where: whereClause,
    with: {
      originStore: {
        columns: {
          name: true,
        },
      },
    },
  });
}

export function countCustomers(whereClause?: SQL<unknown>) {
  return db.$count(customersTable, whereClause);
}

export function findCustomerById(id: number) {
  return db.query.customersTable.findFirst({
    where: eq(customersTable.id, id),
    with: {
      originStore: true,
    },
  });
}

export function createCustomer(
  values: InferInsertModel<typeof customersTable>
) {
  return db.insert(customersTable).values(values).returning();
}

export function updateCustomer(
  id: number,
  values: Partial<InferInsertModel<typeof customersTable>>
) {
  return db
    .update(customersTable)
    .set(values)
    .where(eq(customersTable.id, id))
    .returning();
}
