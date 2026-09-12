import { eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import {
  orderRefundsTable,
  type ordersProductsTable,
  type ordersServicesTable,
  ordersTable,
} from "@/db/schema";
import type { DateRange } from "@/modules/reports/report-range.util";

export interface RangeArgs {
  range: DateRange;
  storeId?: number;
}

export function storeScope(column: PgColumn, storeId?: number) {
  return storeId === undefined ? undefined : eq(column, storeId);
}

// The closing instant belongs to the next stretch, not this one — otherwise
// 1 September's first order is billed to August and to September both.
export function timeWindow(column: PgColumn, range: DateRange) {
  return [gte(column, range.start), lt(column, range.end)];
}

export function paidOrderWindow({ range, storeId }: RangeArgs) {
  return [
    ...timeWindow(ordersTable.paid_at, range),
    isNotNull(ordersTable.paid_at),
    storeScope(ordersTable.store_id, storeId),
  ];
}

// A stretch the shop was shut still needs a Rp0 bar, not a blank one.
export const sumMoney = (column: PgColumn) =>
  sql<string>`COALESCE(SUM(${column}), 0)`;

// What the shop quoted, before any Campaign or Voucher came off.
export function grossSales(
  lineTable: typeof ordersServicesTable | typeof ordersProductsTable
) {
  return sumMoney(lineTable.subtotal);
}

// What the counter actually took on paid Orders in the stretch.
export function collected() {
  return sumMoney(ordersTable.paid_amount);
}

export function discount() {
  return sumMoney(ordersTable.discount);
}

export function refunded() {
  return sumMoney(orderRefundsTable.total_amount);
}

// Money handed back is dated by the day it was handed back, not by the day of
// the sale it undoes, so the two amounts come off different tables on different
// clocks and can only meet here.
export function revenue(collectedAmount: number, refundedAmount: number) {
  return collectedAmount - refundedAmount;
}
