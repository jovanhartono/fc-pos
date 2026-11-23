import type { InferInsertModel } from "drizzle-orm";
import { EmptyFilter, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { customersTable } from "@/db/schema";
import { toStoredPhonePrefix } from "@/schema/phone";

// A transaction handle lets the Customer and Order commit together (ADR-0011).
export type CustomerExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

interface CustomerFilters {
  search?: string;
}

const buildRelationalWhere = (filters: CustomerFilters) => {
  if (filters.search) {
    return {
      OR: [
        { name: { ilike: `%${filters.search}%` } },
        {
          phone_number: {
            ilike: `%${toStoredPhonePrefix(filters.search)}%`,
          },
        },
      ],
    };
  }
  return EmptyFilter;
};

const buildCountWhere = (filters: CustomerFilters) => {
  if (filters.search) {
    return or(
      ilike(customersTable.name, `%${filters.search}%`),
      ilike(
        customersTable.phone_number,
        `%${toStoredPhonePrefix(filters.search)}%`
      )
    );
  }
};

export const listCustomers = ({
  limit,
  offset,
  filters,
}: {
  limit: number;
  offset: number;
  filters: CustomerFilters;
}) =>
  db.query.customersTable.findMany({
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

export const countCustomers = (filters: CustomerFilters) =>
  db.$count(customersTable, buildCountWhere(filters));

export const findCustomerById = (id: number) =>
  db.query.customersTable.findFirst({
    where: { id },
    with: {
      originStore: true,
    },
  });

export interface CustomerSummary {
  complaints: number;
  last_visit_at: string | null;
  lifetime_spend: string;
  paid_orders: number;
}

// Lifetime spend is never bucketed by period the way Revenue is: the question
// is what this person is worth today, so a refund just lowers it. Last visit
// counts every Order, including the ones they never paid for.
const findCustomerOrderStats = (customerId: number) =>
  db.query.ordersTable.findMany({
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
      // Raw SQL skips drizzle's date handling: without the Z the browser reads
      // UTC as Jakarta time and "last visit" lands seven hours early.
      last_visit_at: sql<
        string | null
      >`to_char(MAX(created_at) OVER (), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`.as(
        "last_visit_at"
      ),
    },
    limit: 1,
  });

const findCustomerComplaintCount = (customerId: number) =>
  db.query.complaintsTable.findMany({
    where: { orderService: { order: { customer_id: customerId } } },
    columns: { id: true },
    extras: { total: sql<number>`(COUNT(*) OVER ())::int`.as("total") },
    limit: 1,
  });

export const findCustomerSummary = async (
  customerId: number
): Promise<CustomerSummary> => {
  const [orders, complaints] = await Promise.all([
    findCustomerOrderStats(customerId),
    findCustomerComplaintCount(customerId),
  ]);

  // A Customer with no Orders yet gets no row back.
  const [stats] = orders;

  return {
    complaints: complaints[0]?.total ?? 0,
    last_visit_at: stats?.last_visit_at ?? null,
    lifetime_spend: stats?.lifetime_spend ?? "0",
    paid_orders: stats?.paid_orders ?? 0,
  };
};

export const findCustomerByPhone = (
  phone_number: string,
  executor: CustomerExecutor = db
) =>
  executor.query.customersTable.findFirst({
    where: { phone_number },
  });

export const insertCustomer = (
  values: InferInsertModel<typeof customersTable>,
  executor: CustomerExecutor = db
) => executor.insert(customersTable).values(values).returning();

export const updateCustomerById = (
  id: number,
  values: Partial<InferInsertModel<typeof customersTable>>
) =>
  db
    .update(customersTable)
    .set(values)
    .where(eq(customersTable.id, id))
    .returning();
