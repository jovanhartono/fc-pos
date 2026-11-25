import { eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { orderRefundsTable, ordersTable } from "@/db/schema";
import type { ordersProductsTable, ordersServicesTable } from "@/db/schema";
import type { DateRange } from "@/modules/reports/report-range.util";

export interface RangeArgs {
  range: DateRange;
  storeId?: number;
}

export const storeScope = (column: PgColumn, storeId?: number) =>
  storeId === undefined ? undefined : eq(column, storeId);

// The closing instant belongs to the next stretch, not this one — otherwise
// 1 September's first order is billed to August and to September both.
export const timeWindow = (column: PgColumn, range: DateRange) => [
  gte(column, range.start),
  lt(column, range.end),
];

export const paidOrderWindow = ({ range, storeId }: RangeArgs) => [
  ...timeWindow(ordersTable.paid_at, range),
  isNotNull(ordersTable.paid_at),
  storeScope(ordersTable.store_id, storeId),
];

// A stretch the shop was shut still needs a Rp0 bar, not a blank one.
export const sumMoney = (column: PgColumn) =>
  sql<string>`COALESCE(SUM(${column}), 0)`;

// What the shop quoted, before any Campaign or Voucher came off.
export const grossSales = (
  lineTable: typeof ordersServicesTable | typeof ordersProductsTable
) => sumMoney(lineTable.subtotal);

// What the counter actually took on paid Orders in the stretch.
export const collected = () => sumMoney(ordersTable.paid_amount);

export const discount = () => sumMoney(ordersTable.discount);

export const refunded = () => sumMoney(orderRefundsTable.total_amount);

// ADR-0023: refunds and collected money are dated on different clocks, so the
// two can only meet here.
export const revenue = (collectedAmount: number, refundedAmount: number) =>
  collectedAmount - refundedAmount;
