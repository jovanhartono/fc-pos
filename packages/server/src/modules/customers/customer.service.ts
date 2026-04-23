import type { InferInsertModel } from "drizzle-orm";
import type { customersTable } from "@/db/schema";
import {
  countCustomers,
  findCustomerById,
  findCustomerByPhone,
  insertCustomer,
  listCustomers,
  updateCustomerById,
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

export async function createCustomer({
  actorId,
  payload,
}: {
  actorId: number;
  payload: Omit<
    InferInsertModel<typeof customersTable>,
    "created_by" | "updated_by"
  >;
}) {
  const existing = await findCustomerByPhone(payload.phone_number);
  if (existing) {
    return { customer: existing, existed: true as const };
  }

  try {
    const [customer] = await insertCustomer({
      ...payload,
      created_by: actorId,
      updated_by: actorId,
    });

    return { customer, existed: false as const };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await findCustomerByPhone(payload.phone_number);
      if (raced) {
        return { customer: raced, existed: true as const };
      }
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null && "code" in cause) {
    return (cause as { code?: string }).code === "23505";
  }
  return "code" in error && (error as { code?: string }).code === "23505";
}

export async function updateCustomer({
  id,
  actorId,
  payload,
}: {
  id: number;
  actorId: number;
  payload: Partial<InferInsertModel<typeof customersTable>>;
}) {
  const [customer] = await updateCustomerById(id, {
    ...payload,
    updated_by: actorId,
  });

  return customer ?? null;
}
