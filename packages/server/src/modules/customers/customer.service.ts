import type { InferInsertModel } from "drizzle-orm";
import type { customersTable } from "@/db/schema";
import {
  type CustomerExecutor,
  countCustomers,
  findCustomerById,
  findCustomerByPhone,
  insertCustomer,
  listCustomers,
  updateCustomerById,
} from "@/modules/customers/customer.repository";
import type { GetCustomersQuery } from "@/modules/customers/customer.schema";
import { isUniqueViolation } from "@/utils/errors";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";
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

export function getCustomerById(id: number) {
  return findCustomerById(id);
}

// Exact-phone lookup for the POS name-prefill. Phone is identity (UNIQUE), so
// this is 0-or-1 — never a list. UX-only; checkout still find-or-creates by
// phone server-side. See ADR-0011.
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

// Find-or-create a Customer by phone, runnable inside an Order transaction so
// the Customer and Order commit (or roll back) together — never an orphan. A
// phone hit reuses the existing record (phone is identity); only brand-new
// Customers are inserted, Title Cased. See ADR-0011.
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

  // No in-transaction retry on a unique-violation race: a 23505 poisons the
  // whole Postgres transaction, so a retry read here would only throw 25P02.
  // The race (two Orders for the same brand-new phone in the same instant) is
  // operationally near-impossible; the UNIQUE constraint is the backstop —
  // 23505 rolls back the Order, and the cashier's retry finds the row above.
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
