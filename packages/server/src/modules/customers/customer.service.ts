import type { InferInsertModel } from "drizzle-orm";
import type { customersTable } from "@/db/schema";
import {
  countCustomers,
  createCustomer,
  findCustomerById,
  listCustomers,
  updateCustomer,
} from "@/modules/customers/customer.repository";
import type { GetCustomersQuery } from "@/modules/customers/customer.schema";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";

export async function getCustomers(query?: GetCustomersQuery) {
  const pagination = normalizePagination(query, { maxPageSize: 100 });
  const filters = { search: query?.search };

  const [items, total] = await Promise.all([
    listCustomers({
      limit: pagination.limit,
      offset: pagination.offset,
      filters,
    }),
    countCustomers(filters),
  ]);

  return {
    items,
    meta: buildPaginationMeta(total, pagination),
  };
}

export function getCustomerById(id: number) {
  return findCustomerById(id);
}

export async function createCustomerService({
  actorId,
  payload,
}: {
  actorId: number;
  payload: Omit<
    InferInsertModel<typeof customersTable>,
    "created_by" | "updated_by"
  >;
}) {
  const [customer] = await createCustomer({
    ...payload,
    created_by: actorId,
    updated_by: actorId,
  });

  return customer;
}

export async function updateCustomerService({
  id,
  actorId,
  payload,
}: {
  id: number;
  actorId: number;
  payload: Partial<InferInsertModel<typeof customersTable>>;
}) {
  const [customer] = await updateCustomer(id, {
    ...payload,
    updated_by: actorId,
  });

  return customer ?? null;
}
