import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categoriesTable,
  customersTable,
  itemsTable,
  orderPickupEventsTable,
  orderRefundItemsTable,
  orderRefundsTable,
  ordersProductsTable,
  ordersServicesTable,
  ordersTable,
  paymentMethodsTable,
  productsTable,
  servicesTable,
  usersTable,
} from "@/db/schema";
import { paidOrderWindow, timeWindow } from "@/modules/reports/money-basis";
import type { DateRange } from "@/modules/reports/report-range.util";

export function listPaidOrders(storeId: number, range: DateRange) {
  return db
    .select({
      amount: ordersTable.paid_amount,
      code: ordersTable.code,
      created_at: ordersTable.created_at,
      customer_name: customersTable.name,
      method_name: paymentMethodsTable.name,
      order_id: ordersTable.id,
      paid_at: ordersTable.paid_at,
      payment_method_id: ordersTable.payment_method_id,
      recorded_by: usersTable.name,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
    .leftJoin(
      paymentMethodsTable,
      eq(ordersTable.payment_method_id, paymentMethodsTable.id)
    )
    .leftJoin(usersTable, eq(ordersTable.paid_by, usersTable.id))
    .where(and(...paidOrderWindow({ range, storeId })))
    .orderBy(asc(ordersTable.paid_at), asc(ordersTable.id));
}

export function listRefundsInDay(storeId: number, range: DateRange) {
  return db
    .select({
      amount: orderRefundsTable.total_amount,
      customer_name: customersTable.name,
      method_name: paymentMethodsTable.name,
      order_code: ordersTable.code,
      order_id: ordersTable.id,
      paid_at: ordersTable.paid_at,
      refund_id: orderRefundsTable.id,
      refunded_at: orderRefundsTable.created_at,
    })
    .from(orderRefundsTable)
    .innerJoin(ordersTable, eq(orderRefundsTable.order_id, ordersTable.id))
    .innerJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
    .leftJoin(
      paymentMethodsTable,
      eq(ordersTable.payment_method_id, paymentMethodsTable.id)
    )
    .where(
      and(
        eq(ordersTable.store_id, storeId),
        ...timeWindow(orderRefundsTable.created_at, range)
      )
    )
    .orderBy(asc(orderRefundsTable.created_at), asc(orderRefundsTable.id));
}

export function listRefundReasons(refundIds: number[]) {
  return db
    .selectDistinct({
      reason: orderRefundItemsTable.reason,
      refund_id: orderRefundItemsTable.order_refund_id,
    })
    .from(orderRefundItemsTable)
    .where(inArray(orderRefundItemsTable.order_refund_id, refundIds))
    .orderBy(orderRefundItemsTable.reason);
}

// Cancelled Orders are in: they were dropped off, even if never paid.
export function listDroppedOffOrders(storeId: number, range: DateRange) {
  return db
    .select({
      cancelled_at: ordersTable.cancelled_at,
      code: ordersTable.code,
      created_at: ordersTable.created_at,
      customer_name: customersTable.name,
      discount: ordersTable.discount,
      items: sql<number>`COUNT(${itemsTable.id})::int`,
      method_name: paymentMethodsTable.name,
      order_id: ordersTable.id,
      paid_at: ordersTable.paid_at,
      total: ordersTable.total,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
    .leftJoin(itemsTable, eq(itemsTable.order_id, ordersTable.id))
    .leftJoin(
      paymentMethodsTable,
      eq(ordersTable.payment_method_id, paymentMethodsTable.id)
    )
    .where(
      and(
        eq(ordersTable.store_id, storeId),
        ...timeWindow(ordersTable.created_at, range)
      )
    )
    .groupBy(ordersTable.id, customersTable.id, paymentMethodsTable.id)
    .orderBy(asc(ordersTable.created_at), asc(ordersTable.id));
}

// A Rework is a free re-do of work already counted, not new work dropped off.
export function listDroppedOffServices(storeId: number, range: DateRange) {
  return db
    .select({
      category: categoriesTable.name,
      count: sql<number>`COUNT(*)::int`,
      service: servicesTable.name,
      service_id: servicesTable.id,
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .innerJoin(
      categoriesTable,
      eq(servicesTable.category_id, categoriesTable.id)
    )
    .where(
      and(
        eq(ordersTable.store_id, storeId),
        ...timeWindow(ordersTable.created_at, range),
        sql`${ordersServicesTable.complaint_id} IS NULL`
      )
    )
    .groupBy(categoriesTable.id, servicesTable.id);
}

export function listDroppedOffProducts(storeId: number, range: DateRange) {
  return db
    .select({
      name: productsTable.name,
      product_id: productsTable.id,
      qty: sql<number>`SUM(${ordersProductsTable.qty})::int`,
    })
    .from(ordersProductsTable)
    .innerJoin(ordersTable, eq(ordersProductsTable.order_id, ordersTable.id))
    .innerJoin(
      productsTable,
      eq(ordersProductsTable.product_id, productsTable.id)
    )
    .where(
      and(
        eq(ordersTable.store_id, storeId),
        ...timeWindow(ordersTable.created_at, range)
      )
    )
    .groupBy(productsTable.id)
    .orderBy(asc(productsTable.name));
}

// A part pickup counts as the Order picked up that day.
export function listPickedUpOrders(storeId: number, range: DateRange) {
  const lastPickupAt = max(orderPickupEventsTable.picked_up_at);

  return db
    .select({
      code: ordersTable.code,
      created_at: ordersTable.created_at,
      customer_name: customersTable.name,
      items: sql<number>`COUNT(DISTINCT ${ordersServicesTable.item_id})::int`,
      order_id: ordersTable.id,
      picked_up_at: lastPickupAt,
    })
    .from(orderPickupEventsTable)
    .innerJoin(ordersTable, eq(orderPickupEventsTable.order_id, ordersTable.id))
    .innerJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
    .leftJoin(
      ordersServicesTable,
      eq(ordersServicesTable.pickup_event_id, orderPickupEventsTable.id)
    )
    .where(
      and(
        eq(ordersTable.store_id, storeId),
        ...timeWindow(orderPickupEventsTable.picked_up_at, range)
      )
    )
    .groupBy(ordersTable.id, customersTable.id)
    .orderBy(asc(lastPickupAt), asc(ordersTable.id));
}

export function listOrderLinesWithPickup(orderIds: number[]) {
  return db
    .select({
      item_id: ordersServicesTable.item_id,
      order_id: ordersServicesTable.order_id,
      picked_up_at: orderPickupEventsTable.picked_up_at,
      pickup_event_id: ordersServicesTable.pickup_event_id,
      status: ordersServicesTable.status,
    })
    .from(ordersServicesTable)
    .leftJoin(
      orderPickupEventsTable,
      eq(ordersServicesTable.pickup_event_id, orderPickupEventsTable.id)
    )
    .where(inArray(ordersServicesTable.order_id, orderIds));
}
