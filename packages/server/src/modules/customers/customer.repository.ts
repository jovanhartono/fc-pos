import type { InferInsertModel } from "drizzle-orm";
import { eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customersTable } from "@/db/schema";

// Either the pool-backed db or a transaction handle, so find-or-create can run
// inside an Order transaction (atomic Customer + Order — see ADR-0011) or
// standalone.
export type CustomerExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

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
}

function buildCountWhere(filters: CustomerFilters) {
  if (filters.search) {
    const searchPattern = `%${filters.search}%`;
    return or(
      ilike(customersTable.name, searchPattern),
      ilike(customersTable.phone_number, searchPattern)
    );
  }
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

export interface CustomerSummary {
  complaints: number;
  last_visit_at: string | null;
  lifetime_spend: string;
  paid_orders: number;
}

// Lifetime spend is never bucketed by period the way Revenue is: the question
// is what this person is worth today, so a refund just lowers it. Last visit
// counts every Order, including the ones they never paid for.
function findCustomerOrderStats(customerId: number) {
  return db.query.ordersTable.findMany({
    where: { customer_id: customerId },
    columns: { id: true },
    extras: {
      lifetime_spend:
        sql<string>`COALESCE(SUM(paid_amount - refunded_amount) FILTER (WHERE payment_status = 'paid') OVER (), 0)`.as(
          "lifetime_spend"
        ),
      paid_orders:
        sql<number>`(COUNT(*) FILTER (WHERE payment_status = 'paid') OVER ())::int`.as(
          "paid_orders"
        ),
      // Raw SQL skips drizzle's timestamp mapper, so the instant has to carry
      // its own Z. Without it the browser reads the stored UTC as Jakarta time
      // and "last visit" lands seven hours before the newest Order listed
      // underneath it.
      last_visit_at: sql<
        string | null
      >`to_char(MAX(created_at) OVER (), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`.as(
        "last_visit_at"
      ),
    },
    limit: 1,
  });
}

function findCustomerComplaintCount(customerId: number) {
  return db.query.complaintsTable.findMany({
    where: { orderService: { order: { customer_id: customerId } } },
    columns: { id: true },
    extras: { total: sql<number>`(COUNT(*) OVER ())::int`.as("total") },
    limit: 1,
  });
}

export async function findCustomerSummary(
  customerId: number
): Promise<CustomerSummary> {
  const [orders, complaints] = await Promise.all([
    findCustomerOrderStats(customerId),
    findCustomerComplaintCount(customerId),
  ]);

  // A customer with no Orders yet gets no row back — the window had nothing to
  // report itself on.
  const [stats] = orders;

  return {
    complaints: complaints[0]?.total ?? 0,
    last_visit_at: stats?.last_visit_at ?? null,
    lifetime_spend: stats?.lifetime_spend ?? "0",
    paid_orders: stats?.paid_orders ?? 0,
  };
}

export function findCustomerByPhone(
  phone_number: string,
  executor: CustomerExecutor = db
) {
  return executor.query.customersTable.findFirst({
    where: { phone_number },
  });
}

// The public tracker matches a caller by phone and never shows the row, so it
// gets the id and nothing else.
export function findCustomerIdByPhone(phone_number: string) {
  return db.query.customersTable.findFirst({
    where: { phone_number },
    columns: { id: true },
  });
}

export function insertCustomer(
  values: InferInsertModel<typeof customersTable>,
  executor: CustomerExecutor = db
) {
  return executor.insert(customersTable).values(values).returning();
}

export function updateCustomerById(
  id: number,
  values: Partial<InferInsertModel<typeof customersTable>>
) {
  return db
    .update(customersTable)
    .set(values)
    .where(eq(customersTable.id, id))
    .returning();
}
