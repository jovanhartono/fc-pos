import type { InferInsertModel } from "drizzle-orm";
import { eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { customersTable } from "@/db/schema";

interface CustomerFilters {
  search?: string;
}

function buildRelationalWhere(filters: CustomerFilters) {
  if (filters.search) {
    const searchPattern = `%${filters.search}%`;
    return {
      OR: [
        { name: { ilike: searchPattern } },
        { phone_number: { ilike: searchPattern } },
      ],
    };
  }
  return undefined;
}

function buildCountWhere(filters: CustomerFilters) {
  if (filters.search) {
    const searchPattern = `%${filters.search}%`;
    return or(
      ilike(customersTable.name, searchPattern),
      ilike(customersTable.phone_number, searchPattern)
    );
  }
  return undefined;
}

export function listCustomers({
  limit,
  offset,
  filters,
}: {
  limit: number;
  offset: number;
  filters: CustomerFilters;
}) {
  return db.query.customersTable.findMany({
    orderBy: { id: "asc" },
    limit,
    offset,
    where: buildRelationalWhere(filters),
    with: {
      originStore: {
        columns: {
          name: true,
        },
      },
    },
  });
}

export function countCustomers(filters: CustomerFilters) {
  return db.$count(customersTable, buildCountWhere(filters));
}

export function findCustomerById(id: number) {
  return db.query.customersTable.findFirst({
    where: { id },
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
