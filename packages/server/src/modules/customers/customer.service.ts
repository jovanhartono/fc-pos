import type { InferInsertModel } from "drizzle-orm";
import type { customersTable } from "@/db/schema";
import {
  type CustomerExecutor,
  countCustomers,
  findCustomerById,
  findCustomerByPhone,
  findCustomerSummary,
  insertCustomer,
  listCustomers,
  updateCustomerById,
} from "@/modules/customers/customer.repository";
import type { GetCustomersQuery } from "@/modules/customers/customer.schema";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";
import { isUniqueViolation } from "@/utils/pg-error";
import { toTitleCase } from "@/utils/string";

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

// Admin-only (ADR-0021).
export async function getCustomerDetail(id: number) {
  const customer = await findCustomerById(id);

  if (!customer) {
    return null;
  }

  return { ...customer, summary: await findCustomerSummary(id) };
}

// Only prefills the name in the POS; checkout still finds or creates the
// Customer by phone itself (ADR-0011).
export async function getCustomerByPhone(phone_number: string) {
  return (await findCustomerByPhone(phone_number)) ?? null;
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
      name: toTitleCase(payload.name),
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

// Runs inside the Order transaction so a failed checkout leaves no Customer
// behind (ADR-0011).
export async function resolveOrCreateCustomer({
  executor,
  actorId,
  name,
  phone_number,
  origin_store_id,
}: {
  executor: CustomerExecutor;
  actorId: number;
  name: string;
  phone_number: string;
  origin_store_id: number;
}): Promise<number> {
  const existing = await findCustomerByPhone(phone_number, executor);
  if (existing) {
    return existing.id;
  }

  // No retry here: a duplicate phone aborts the whole transaction (25P02). Two
  // checkouts for one new phone at once roll back, and the cashier's retry
  // finds the Customer above.
  const [customer] = await insertCustomer(
    {
      name: toTitleCase(name),
      phone_number,
      origin_store_id,
      created_by: actorId,
      updated_by: actorId,
    },
    executor
  );
  if (!customer) {
    throw new Error("Failed to create customer");
  }
  return customer.id;
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
