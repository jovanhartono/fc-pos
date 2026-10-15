import {
  listDroppedOffOrders,
  listDroppedOffProducts,
  listDroppedOffServices,
  listPaidOrders,
  listPickedUpOrders,
  listRefundReasons,
  listRefundsInDay,
} from "@/modules/counter/day-close.repository";
import type {
  DayClose,
  DayCloseCategory,
  DayCloseMethod,
  DayCloseOrder,
  DayCloseTotal,
} from "@/modules/counter/day-close.schema";
import {
  type DateRange,
  getJakartaDayRange,
  jakartaDayOf,
} from "@/modules/reports/report-range.util";

const NO_METHOD = "No PaymentMethod";

const total = (rows: { amount: number }[]): DayCloseTotal => ({
  amount: rows.reduce((sum, row) => sum + row.amount, 0),
  payments: rows.length,
});

const byMethodId = (a: DayCloseMethod, b: DayCloseMethod) =>
  (a.payment_method_id ?? Number.POSITIVE_INFINITY) -
  (b.payment_method_id ?? Number.POSITIVE_INFINITY);

function buildCategories(
  rows: Awaited<ReturnType<typeof listDroppedOffServices>>
): DayCloseCategory[] {
  return [...Map.groupBy(rows, (row) => row.category).entries()]
    .map(([name, lines]) => ({
      count: lines.reduce((sum, line) => sum + line.count, 0),
      name,
      services: lines
        .map((line) => ({
          count: line.count,
          name: line.service,
          service_id: line.service_id,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// A closed day never changes after the fact: an Order paid or cancelled on a
// later day was still unpaid when this day closed.
function buildOrderList(
  rows: Awaited<ReturnType<typeof listDroppedOffOrders>>,
  dayEnd: Date
): DayCloseOrder[] {
  return rows.map((row) => {
    const isPaid = row.paid_at !== null && row.paid_at < dayEnd;
    return {
      amount: Number(row.total) - Number(row.discount),
      created_at: row.created_at.toISOString(),
      is_cancelled: row.cancelled_at !== null && row.cancelled_at < dayEnd,
      is_paid: isPaid,
      items: row.items,
      order_code: row.code,
      order_id: row.order_id,
      paid_day: row.paid_at && !isPaid ? jakartaDayOf(row.paid_at) : null,
      payment_method_name: isPaid ? (row.method_name ?? NO_METHOD) : null,
    };
  });
}

async function buildRefunds(storeId: number, range: DateRange) {
  const refunds = await listRefundsInDay(storeId, range);
  const reasons =
    refunds.length > 0
      ? await listRefundReasons(refunds.map((refund) => refund.refund_id))
      : [];
  const reasonsByRefund = Map.groupBy(reasons, (row) => row.refund_id);

  return refunds.map((refund) => ({
    amount: Number(refund.amount),
    order_code: refund.order_code,
    order_id: refund.order_id,
    paid_day: refund.paid_at ? jakartaDayOf(refund.paid_at) : null,
    payment_method_name: refund.method_name ?? NO_METHOD,
    reasons: (reasonsByRefund.get(refund.refund_id) ?? []).map(
      (row) => row.reason
    ),
    refunded_at: refund.refunded_at.toISOString(),
  }));
}

// One Store's closing summary for one Jakarta day, to check the money against
// the card-terminal slips. Refunds stay on their own line: a refund records no
// PaymentMethod, so subtracting it from a method would be a guess.
export async function getDayClose(
  storeId: number,
  date: string
): Promise<DayClose> {
  const range = getJakartaDayRange(date);
  const [paidOrders, refunds, droppedOff, services, products, pickedUp] =
    await Promise.all([
      listPaidOrders(storeId, range),
      buildRefunds(storeId, range),
      listDroppedOffOrders(storeId, range),
      listDroppedOffServices(storeId, range),
      listDroppedOffProducts(storeId, range),
      listPickedUpOrders(storeId, range),
    ]);

  const payments = paidOrders.map((order) => ({
    amount: Number(order.amount),
    created_day: jakartaDayOf(order.created_at),
    order_code: order.code,
    order_id: order.order_id,
    paid_at: (order.paid_at as Date).toISOString(),
    payment_method_id: order.payment_method_id,
    payment_method_name: order.method_name ?? NO_METHOD,
    recorded_by: order.recorded_by,
  }));

  const methods = [
    ...Map.groupBy(payments, (payment) => payment.payment_method_id).entries(),
  ]
    .map(([paymentMethodId, rows]) => ({
      ...total(rows),
      name: rows[0].payment_method_name,
      payment_method_id: paymentMethodId,
    }))
    .sort(byMethodId);

  const orderList = buildOrderList(droppedOff, range.end);
  const pickedUpList = pickedUp.map((order) => ({
    created_day: jakartaDayOf(order.created_at),
    items: order.items,
    order_code: order.code,
    order_id: order.order_id,
    picked_up_at: (order.picked_up_at as Date).toISOString(),
  }));

  return {
    collected: {
      amount: total(payments).amount,
      earlier: total(payments.filter((p) => p.created_day !== date)).amount,
      this_day: total(payments.filter((p) => p.created_day === date)).amount,
    },
    date,
    dropped_off: {
      categories: buildCategories(services),
      items: orderList.reduce((sum, order) => sum + order.items, 0),
      order_list: orderList,
      orders: orderList.length,
      product_lines: products,
      products: products.reduce((sum, line) => sum + line.qty, 0),
      services: services.reduce((sum, line) => sum + line.count, 0),
    },
    methods,
    payments,
    picked_up: {
      items: pickedUpList.reduce((sum, order) => sum + order.items, 0),
      order_list: pickedUpList,
      orders: pickedUpList.length,
    },
    refunds,
  };
}
