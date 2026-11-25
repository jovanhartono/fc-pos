import { NotFoundException } from "@/http-exceptions";
import { pickItemName } from "@/modules/orders/order-read.repository";
import type { ItemNameFields } from "@/modules/orders/order.schema";
import { revenue } from "@/modules/reports/money-basis";
import {
  findCumulativeCustomersBefore,
  findRepeatCustomerStats,
  listBusyHourRows,
  listCampaignEffectivenessRows,
  listCategoryGrossSalesSeries,
  listCollectedSeries,
  listComplaintItems,
  listItemsInHand,
  listNewCustomersSeries,
  listOrderDiscountSeries,
  listOrdersInSeries,
  listOrdersOutSeries,
  listPaymentMixSeries,
  listProcessedLineStarts,
  listProductsSeries,
  listQcChecksOfCleaner,
  listRefundAmountSeries,
  listReturningCustomerOrdersSeries,
  listServicesSeries,
  listStoreCategoryGrossSalesRows,
  listStoreCollectedRows,
  listStoreNames,
  listStoreRefundRows,
  listTopCustomers,
  listTopServiceRows,
  listUnpaidOrderAgeRows,
  listUserNames,
  listWorkerActivity,
  listWorkerLiveActivity,
  listWorkerSummaryActivity,
  UNPAID_AGE_KEYS,
} from "@/modules/reports/report-range.repository";
import {
  daysBetween,
  deltaPct,
  derivePreviousRange,
  enumerateBuckets,
  enumerateDays,
  getJakartaRange,
  indexBy,
  jakartaDayOf,
  percentile,
  pickGranularity,
  rate,
  weekStartOf,
} from "@/modules/reports/report-range.util";
import type {
  DateRange,
  Granularity,
} from "@/modules/reports/report-range.util";
import type {
  ComparableSummary,
  GetReportRangeQuery,
  GetWorkerDetailQuery,
  GetWorkerLiveQuery,
  KpiDelta,
} from "@/modules/reports/report.schema";
import { OTHER_CATEGORY_ID } from "@/schema/category-mix";
import { complaintOutcome } from "@/schema/complaint";
import { jakartaNow } from "@/utils/date";
import { buildMediaUrl } from "@/utils/s3";

interface PeriodWindow {
  buckets: string[];
  from: string;
  range: ReturnType<typeof getJakartaRange>;
  to: string;
}

interface ReportContext {
  buckets: string[];
  from: string;
  granularity: Granularity;
  previous: PeriodWindow;
  store_id: number | null;
  to: string;
}

export const buildContext = (query: GetReportRangeQuery): ReportContext => {
  const granularity =
    query.granularity ?? pickGranularity(query.from, query.to);
  const buckets = enumerateBuckets(query.from, query.to, granularity);
  const prev = derivePreviousRange(query.from, query.to);
  const previous: PeriodWindow = {
    from: prev.from,
    to: prev.to,
    range: getJakartaRange(prev.from, prev.to),
    buckets: enumerateBuckets(prev.from, prev.to, granularity),
  };
  return {
    from: query.from,
    to: query.to,
    store_id: query.store_id ?? null,
    granularity,
    buckets,
    previous,
  };
};

const kpi = <T extends number>(current: T, previous: T): KpiDelta<T> => ({
  current,
  previous,
  delta_pct: deltaPct(current, previous),
});

export const buildDeltas = <T extends object>(
  current: T,
  previous: T
): ComparableSummary<T>["deltas"] => {
  const deltas: Record<string, KpiDelta> = {};
  for (const key of Object.keys(current) as (keyof T)[]) {
    const c = current[key];
    const p = previous[key];
    if (typeof c === "number" && typeof p === "number") {
      deltas[key as string] = kpi(c, p);
    }
  }
  return deltas as ComparableSummary<T>["deltas"];
};

interface FinancialSummary {
  cogs: number;
  collected: number;
  delivery_fees: number;
  discount: number;
  discount_rate: number;
  gross_profit: number;
  gross_sales: number;
  margin: number;
  products_gross_sales: number;
  refund_rate: number;
  refunds: number;
  revenue: number;
  services_gross_sales: number;
}

const financialSummaryFor = async ({
  range,
  storeId,
  granularity,
}: {
  range: ReturnType<typeof getJakartaRange>;
  storeId?: number;
  granularity: Granularity;
}) => {
  const [services, products, discount, collected, refunds] = await Promise.all([
    listServicesSeries({ range, storeId, granularity }),
    listProductsSeries({ range, storeId, granularity }),
    listOrderDiscountSeries({ range, storeId, granularity }),
    listCollectedSeries({ range, storeId, granularity }),
    listRefundAmountSeries({ range, storeId, granularity }),
  ]);
  return { services, products, discount, collected, refunds };
};

// A store that took nothing this stretch but handed money back still needs a
// line of its own, or the store rows stop adding up to the range's Revenue.
const mergeStoreRows = (
  collectedRows: Awaited<ReturnType<typeof listStoreCollectedRows>>,
  refundRows: Awaited<ReturnType<typeof listStoreRefundRows>>
) => {
  const byStore = new Map(
    collectedRows.map((row) => [row.store_id, { ...row, refunds: 0 }])
  );
  for (const row of refundRows) {
    const existing = byStore.get(row.store_id);
    if (existing) {
      existing.refunds = row.refunds;
    } else {
      byStore.set(row.store_id, { ...row, collected: 0, orders: 0 });
    }
  }
  return [...byStore.values()].map((row) => ({
    ...row,
    revenue: revenue(row.collected, row.refunds),
  }));
};

const summariseFinancial = (raw: {
  services: { gross_sales: number; cogs: number }[];
  products: { gross_sales: number; cogs: number }[];
  discount: { discount: number }[];
  collected: { collected: number; delivery_fees: number }[];
  refunds: { amount: number }[];
}): FinancialSummary => {
  const servicesGrossSales = raw.services.reduce(
    (s, r) => s + r.gross_sales,
    0
  );
  const productsGrossSales = raw.products.reduce(
    (s, r) => s + r.gross_sales,
    0
  );
  const cogs =
    raw.services.reduce((s, r) => s + r.cogs, 0) +
    raw.products.reduce((s, r) => s + r.cogs, 0);
  const discount = raw.discount.reduce((s, r) => s + r.discount, 0);
  const collected = raw.collected.reduce((s, r) => s + r.collected, 0);
  const deliveryFees = raw.collected.reduce((s, r) => s + r.delivery_fees, 0);
  const refunds = raw.refunds.reduce((s, r) => s + r.amount, 0);
  const kept = revenue(collected, refunds);
  const grossProfit = kept - cogs;
  const grossSalesTotal = servicesGrossSales + productsGrossSales;
  return {
    gross_sales: grossSalesTotal,
    services_gross_sales: servicesGrossSales,
    products_gross_sales: productsGrossSales,
    discount,
    discount_rate: grossSalesTotal > 0 ? discount / grossSalesTotal : 0,
    collected,
    delivery_fees: deliveryFees,
    refunds,
    refund_rate: collected > 0 ? refunds / collected : 0,
    revenue: kept,
    cogs,
    gross_profit: grossProfit,
    margin: kept > 0 ? grossProfit / kept : 0,
  };
};

export const getFinancialReport = async (query: GetReportRangeQuery) => {
  const ctx = buildContext(query);
  const range = getJakartaRange(ctx.from, ctx.to);
  const storeId = ctx.store_id ?? undefined;

  const [
    current,
    previous,
    categories,
    storeCollected,
    storeRefunds,
    storeCategoryRows,
    busyHours,
    topServices,
    unpaidRows,
  ] = await Promise.all([
    financialSummaryFor({ range, storeId, granularity: ctx.granularity }),
    financialSummaryFor({
      range: ctx.previous.range,
      storeId,
      granularity: ctx.granularity,
    }),
    listCategoryGrossSalesSeries({
      range,
      storeId,
      granularity: ctx.granularity,
    }),
    listStoreCollectedRows({ range, storeId }),
    listStoreRefundRows({ range, storeId }),
    listStoreCategoryGrossSalesRows({ range, storeId }),
    listBusyHourRows({ range, storeId }),
    listTopServiceRows({ range, storeId }),
    listUnpaidOrderAgeRows({ storeId }),
  ]);

  const unpaidOrders = UNPAID_AGE_KEYS.map(
    (key) =>
      unpaidRows.find((row) => row.key === key) ?? {
        key,
        orders: 0,
        amount: 0,
      }
  );

  const servicesMap = indexBy(current.services);
  const productsMap = indexBy(current.products);
  const discountMap = indexBy(current.discount);
  const collectedMap = indexBy(current.collected);
  const refundsMap = indexBy(current.refunds);

  const series = ctx.buckets.map((bucket) => {
    const s = servicesMap.get(bucket)?.gross_sales ?? 0;
    const p = productsMap.get(bucket)?.gross_sales ?? 0;
    const sc = servicesMap.get(bucket)?.cogs ?? 0;
    const pc = productsMap.get(bucket)?.cogs ?? 0;
    const d = discountMap.get(bucket)?.discount ?? 0;
    const c = collectedMap.get(bucket)?.collected ?? 0;
    const r = refundsMap.get(bucket)?.amount ?? 0;
    const cogs = sc + pc;
    const kept = revenue(c, r);
    return {
      bucket,
      services: s,
      products: p,
      gross_sales: s + p,
      discount: d,
      collected: c,
      refunds: r,
      revenue: kept,
      cogs,
      gross_profit: kept - cogs,
    };
  });

  const summary = summariseFinancial(current);
  const prevSummary = summariseFinancial(previous);

  const categoryTotals = new Map<
    number,
    { category_id: number; category_name: string; gross_sales: number }
  >();
  for (const row of categories) {
    const entry = categoryTotals.get(row.category_id);
    if (entry) {
      entry.gross_sales += row.gross_sales;
    } else {
      categoryTotals.set(row.category_id, {
        category_id: row.category_id,
        category_name: row.category_name,
        gross_sales: row.gross_sales,
      });
    }
  }
  const topCategories = [...categoryTotals.values()]
    .toSorted((a, b) => b.gross_sales - a.gross_sales)
    .slice(0, 5);
  const topCategoryIds = new Set(topCategories.map((c) => c.category_id));

  const categorySeriesMap = new Map<string, Record<string, number>>();
  for (const row of categories) {
    const bucketRow = categorySeriesMap.get(row.bucket) ?? {};
    const key = topCategoryIds.has(row.category_id)
      ? `cat_${row.category_id}`
      : "cat_other";
    bucketRow[key] = (bucketRow[key] ?? 0) + row.gross_sales;
    categorySeriesMap.set(row.bucket, bucketRow);
  }
  const hasOther = categoryTotals.size > topCategories.length;
  const categoryKeys = [
    ...topCategories.map((c) => ({
      key: `cat_${c.category_id}`,
      label: c.category_name,
    })),
    ...(hasOther ? [{ key: "cat_other", label: "Other" }] : []),
  ];
  const categorySeries = ctx.buckets.map((bucket) => {
    const row = categorySeriesMap.get(bucket) ?? {};
    const filled: Record<string, number | string> = { bucket };
    for (const { key } of categoryKeys) {
      filled[key] = row[key] ?? 0;
    }
    return filled;
  });

  const categoryTreemap = [...categoryTotals.values()].toSorted(
    (a, b) => b.gross_sales - a.gross_sales
  );

  const storeRows = mergeStoreRows(storeCollected, storeRefunds);
  const grandStoreRevenue = storeRows.reduce((s, r) => s + r.revenue, 0);
  const storeBreakdown = storeRows
    .map((row) => ({
      ...row,
      share: grandStoreRevenue > 0 ? row.revenue / grandStoreRevenue : 0,
    }))
    .toSorted((a, b) => b.revenue - a.revenue);

  // One top-N Category list across all Stores, so every Store row has the same
  // columns.
  const STORE_CATEGORY_TOP_N = 6;
  const STORE_CATEGORY_MAX_STORES = 12;

  const globalCategoryTotals = new Map<
    number,
    { label: string; gross_sales: number }
  >();
  for (const row of storeCategoryRows) {
    const entry = globalCategoryTotals.get(row.category_id);
    globalCategoryTotals.set(row.category_id, {
      label: row.category_name,
      gross_sales: (entry?.gross_sales ?? 0) + row.gross_sales,
    });
  }

  const globalSorted = [...globalCategoryTotals.entries()]
    .map(([id, c]) => ({
      category_id: id,
      label: c.label,
      gross_sales: c.gross_sales,
    }))
    .toSorted(
      (a, b) => b.gross_sales - a.gross_sales || a.category_id - b.category_id
    );

  const topCategoryEntries = globalSorted.slice(0, STORE_CATEGORY_TOP_N);
  const hasOtherStoreCategory = globalSorted.length > STORE_CATEGORY_TOP_N;
  const topCategoryIdSet = new Set(
    topCategoryEntries.map((c) => c.category_id)
  );

  const storeCategoryColumns: {
    category_id: number;
    label: string;
    gross_sales: number;
  }[] = topCategoryEntries.map((c) => ({
    category_id: c.category_id,
    label: c.label,
    gross_sales: c.gross_sales,
  }));
  if (hasOtherStoreCategory) {
    const otherTotal = globalSorted
      .slice(STORE_CATEGORY_TOP_N)
      .reduce((s, c) => s + c.gross_sales, 0);
    storeCategoryColumns.push({
      category_id: OTHER_CATEGORY_ID,
      label: "Other",
      gross_sales: otherTotal,
    });
  }

  interface StoreBucket {
    byCategory: Map<number, number>;
    store_code: string;
    store_id: number;
    store_name: string;
    total: number;
  }

  const storeBuckets = new Map<number, StoreBucket>();
  for (const row of storeCategoryRows) {
    const bucket = storeBuckets.get(row.store_id) ?? {
      store_id: row.store_id,
      store_code: row.store_code,
      store_name: row.store_name,
      total: 0,
      byCategory: new Map<number, number>(),
    };
    const colId = topCategoryIdSet.has(row.category_id)
      ? row.category_id
      : OTHER_CATEGORY_ID;
    bucket.byCategory.set(
      colId,
      (bucket.byCategory.get(colId) ?? 0) + row.gross_sales
    );
    bucket.total += row.gross_sales;
    storeBuckets.set(row.store_id, bucket);
  }

  const sortedStoreBuckets = [...storeBuckets.values()].toSorted(
    (a, b) => b.total - a.total
  );
  const omittedStoreCount = Math.max(
    0,
    sortedStoreBuckets.length - STORE_CATEGORY_MAX_STORES
  );
  const visibleStoreBuckets = sortedStoreBuckets.slice(
    0,
    STORE_CATEGORY_MAX_STORES
  );

  const storeCategoryRowsOut = visibleStoreBuckets.map((bucket) => {
    const cells = storeCategoryColumns.map((col) => {
      const amount = bucket.byCategory.get(col.category_id) ?? 0;
      return {
        category_id: col.category_id,
        gross_sales: amount,
        share: bucket.total > 0 ? amount / bucket.total : 0,
      };
    });
    return {
      store_id: bucket.store_id,
      store_code: bucket.store_code,
      store_name: bucket.store_name,
      total: bucket.total,
      cells,
    };
  });

  return {
    from: ctx.from,
    to: ctx.to,
    store_id: ctx.store_id,
    granularity: ctx.granularity,
    previous: { from: ctx.previous.from, to: ctx.previous.to },
    series,
    category_series: categorySeries,
    category_keys: categoryKeys,
    category_treemap: categoryTreemap,
    store_breakdown: storeBreakdown,
    store_category_matrix: {
      columns: storeCategoryColumns,
      rows: storeCategoryRowsOut,
      omitted_stores: omittedStoreCount,
    },
    busy_hours: busyHours,
    top_services: topServices,
    unpaid_orders: unpaidOrders,
    summary: {
      current: summary,
      previous: prevSummary,
      deltas: buildDeltas(summary, prevSummary),
    } satisfies ComparableSummary<FinancialSummary>,
  };
};

interface OrdersFlowSummary {
  net_flow: number;
  orders_in_total: number;
  orders_out_total: number;
}

const ordersFlowSummaryFrom = (
  ordersIn: { orders_in: number }[],
  ordersOut: { orders_out: number }[]
): OrdersFlowSummary => {
  const inTotal = ordersIn.reduce((s, r) => s + r.orders_in, 0);
  const outTotal = ordersOut.reduce((s, r) => s + r.orders_out, 0);
  return {
    orders_in_total: inTotal,
    orders_out_total: outTotal,
    net_flow: inTotal - outTotal,
  };
};

export const getOrdersFlowReport = async (query: GetReportRangeQuery) => {
  const ctx = buildContext(query);
  const range = getJakartaRange(ctx.from, ctx.to);
  const storeId = ctx.store_id ?? undefined;

  const [ordersIn, ordersOut, prevIn, prevOut] = await Promise.all([
    listOrdersInSeries({ range, storeId, granularity: ctx.granularity }),
    listOrdersOutSeries({ range, storeId, granularity: ctx.granularity }),
    listOrdersInSeries({
      range: ctx.previous.range,
      storeId,
      granularity: ctx.granularity,
    }),
    listOrdersOutSeries({
      range: ctx.previous.range,
      storeId,
      granularity: ctx.granularity,
    }),
  ]);

  const inMap = indexBy(ordersIn);
  const outMap = indexBy(ordersOut);
  const series = ctx.buckets.map((bucket) => ({
    bucket,
    orders_in: inMap.get(bucket)?.orders_in ?? 0,
    orders_out: outMap.get(bucket)?.orders_out ?? 0,
  }));

  const summary = ordersFlowSummaryFrom(ordersIn, ordersOut);
  const prevSummary = ordersFlowSummaryFrom(prevIn, prevOut);

  return {
    from: ctx.from,
    to: ctx.to,
    store_id: ctx.store_id,
    granularity: ctx.granularity,
    previous: { from: ctx.previous.from, to: ctx.previous.to },
    series,
    summary: {
      current: summary,
      previous: prevSummary,
      deltas: buildDeltas(summary, prevSummary),
    } satisfies ComparableSummary<OrdersFlowSummary>,
  };
};

export const getPaymentMixReport = async (query: GetReportRangeQuery) => {
  const ctx = buildContext(query);
  const range = getJakartaRange(ctx.from, ctx.to);
  const storeId = ctx.store_id ?? undefined;

  const rows = await listPaymentMixSeries({
    range,
    storeId,
    granularity: ctx.granularity,
  });

  const methodTotals = new Map<
    number,
    {
      payment_method_id: number;
      payment_method_name: string;
      payment_method_code: string;
      collected: number;
      orders: number;
    }
  >();
  for (const row of rows) {
    const current = methodTotals.get(row.payment_method_id);
    if (current) {
      current.collected += row.collected;
      current.orders += row.orders;
    } else {
      methodTotals.set(row.payment_method_id, {
        payment_method_id: row.payment_method_id,
        payment_method_name: row.payment_method_name,
        payment_method_code: row.payment_method_code,
        collected: row.collected,
        orders: row.orders,
      });
    }
  }

  const methods = [...methodTotals.values()].toSorted(
    (a, b) => b.collected - a.collected
  );
  const methodKeys = methods.map((m) => ({
    key: `pm_${m.payment_method_id}`,
    label: m.payment_method_name,
    code: m.payment_method_code,
  }));

  const bucketMap = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const bucketRow = bucketMap.get(row.bucket) ?? {};
    const key = `pm_${row.payment_method_id}`;
    bucketRow[key] = (bucketRow[key] ?? 0) + row.collected;
    bucketMap.set(row.bucket, bucketRow);
  }

  const series = ctx.buckets.map((bucket) => {
    const row = bucketMap.get(bucket) ?? {};
    const filled: Record<string, number | string> = { bucket };
    for (const { key } of methodKeys) {
      filled[key] = row[key] ?? 0;
    }
    return filled;
  });

  const grandTotal = methods.reduce((sum, m) => sum + m.collected, 0);
  const summary = {
    grand_total: grandTotal,
    total_orders: methods.reduce((sum, m) => sum + m.orders, 0),
    methods: methods.map((m) => ({
      ...m,
      share: grandTotal > 0 ? m.collected / grandTotal : 0,
    })),
  };

  return {
    from: ctx.from,
    to: ctx.to,
    store_id: ctx.store_id,
    granularity: ctx.granularity,
    series,
    method_keys: methodKeys,
    summary,
  };
};

interface CustomerSummary {
  active_customers_in_range: number;
  cumulative_end: number;
  cumulative_start: number;
  new_customers: number;
  repeat_customers_in_range: number;
  repeat_rate: number;
}

const customerSummary = (
  series: { new_customers: number; cumulative: number }[],
  priorTotal: number,
  repeat: { total_customers: number; repeat_customers: number }
): CustomerSummary => {
  const addedInRange = series.reduce((s, r) => s + r.new_customers, 0);
  const cumulativeEnd = series.at(-1)?.cumulative ?? priorTotal;
  return {
    new_customers: addedInRange,
    cumulative_end: cumulativeEnd,
    cumulative_start: priorTotal,
    active_customers_in_range: repeat.total_customers,
    repeat_customers_in_range: repeat.repeat_customers,
    repeat_rate:
      repeat.total_customers > 0
        ? repeat.repeat_customers / repeat.total_customers
        : 0,
  };
};

export const getCustomerAcquisitionReport = async (
  query: GetReportRangeQuery
) => {
  const ctx = buildContext(query);
  const range = getJakartaRange(ctx.from, ctx.to);
  const storeId = ctx.store_id ?? undefined;

  const [
    newCustomers,
    priorTotal,
    repeat,
    returningOrders,
    topCustomers,
    prevNew,
    prevPriorTotal,
    prevRepeat,
  ] = await Promise.all([
    listNewCustomersSeries({ range, storeId, granularity: ctx.granularity }),
    findCumulativeCustomersBefore({ before: range.start, storeId }),
    findRepeatCustomerStats({ range, storeId }),
    listReturningCustomerOrdersSeries({
      range,
      storeId,
      granularity: ctx.granularity,
    }),
    listTopCustomers({ range, storeId, limit: 10 }),
    listNewCustomersSeries({
      range: ctx.previous.range,
      storeId,
      granularity: ctx.granularity,
    }),
    findCumulativeCustomersBefore({
      before: ctx.previous.range.start,
      storeId,
    }),
    findRepeatCustomerStats({ range: ctx.previous.range, storeId }),
  ]);

  const newMap = indexBy(newCustomers);
  let running = priorTotal;
  const series = ctx.buckets.map((bucket) => {
    const added = newMap.get(bucket)?.new_customers ?? 0;
    running += added;
    return { bucket, new_customers: added, cumulative: running };
  });

  const splitMap = new Map<string, { new: number; returning: number }>();
  for (const row of returningOrders) {
    const entry = splitMap.get(row.bucket) ?? { new: 0, returning: 0 };
    const customerCreated = row.customer_created_at;
    const isNewCustomer =
      customerCreated >= range.start && customerCreated < range.end;
    if (isNewCustomer) {
      entry.new += row.orders;
    } else {
      entry.returning += row.orders;
    }
    splitMap.set(row.bucket, entry);
  }
  const mixSeries = ctx.buckets.map((bucket) => {
    const entry = splitMap.get(bucket) ?? { new: 0, returning: 0 };
    return {
      bucket,
      new_customer_orders: entry.new,
      returning_customer_orders: entry.returning,
    };
  });

  const current = customerSummary(series, priorTotal, repeat);
  const prevAdded = prevNew.reduce(
    (sum, row) => sum + Number(row.new_customers),
    0
  );
  const prevSeries = [
    {
      bucket: ctx.previous.from,
      new_customers: prevAdded,
      cumulative: prevPriorTotal + prevAdded,
    },
  ];
  const previous = customerSummary(prevSeries, prevPriorTotal, prevRepeat);

  return {
    from: ctx.from,
    to: ctx.to,
    store_id: ctx.store_id,
    granularity: ctx.granularity,
    previous: { from: ctx.previous.from, to: ctx.previous.to },
    series,
    mix_series: mixSeries,
    top_customers: topCustomers,
    summary: {
      current,
      previous,
      deltas: buildDeltas(current, previous),
    } satisfies ComparableSummary<CustomerSummary>,
  };
};

interface WorkerSummary {
  complaint_cohort: number;
  complaint_rate: number;
  complaints: number;
  daily_p25: number | null;
  daily_p75: number | null;
  days_worked: number;
  people: number;
  per_day_worked: number;
  qc_checks: number;
  qc_reject_rate: number;
  qc_rejects: number;
  services_processed: number;
}

type WorkerActivity = Awaited<ReturnType<typeof listWorkerActivity>>;
type ActivityLine = WorkerActivity["lines"][number];
type WorkerSummaryActivity = Awaited<
  ReturnType<typeof listWorkerSummaryActivity>
>;
type WorkerLiveActivity = Awaited<ReturnType<typeof listWorkerLiveActivity>>;

interface ShiftTimes {
  clock_in_at: Date;
  clock_out_at: Date | null;
}

interface WorkerTally {
  // A bench Shift at this Store in the range.
  clocked_in: boolean;
  complaint_cohort: number;
  complaints: number;
  // Jakarta days they clocked in or moved an Item through the bench.
  days_worked: Set<string>;
  in_hand: number;
  last_move_at: Date | null;
  latest_shift: ShiftTimes | null;
  // Services they started, by the Jakarta day each first reached QC.
  processed_by_day: Map<string, number>;
  qc_checks: number;
  qc_rejects: number;
  services_processed: number;
  services_today: number;
  store_id: number;
  user_id: number;
}

// Below this many days worked a spread is one or two days talking.
const MIN_SPREAD_DAYS = 5;
// Past two months a bar per day is too thin to read, so the bars go weekly.
const MAX_DAILY_BAR_DAYS = 62;

const round = (value: number, places: number) => Number(value.toFixed(places));

const workerKey = (userId: number, storeId: number) => `${userId}:${storeId}`;

const sumBy = <T>(rows: T[], pick: (row: T) => number) =>
  rows.reduce((sum, row) => sum + pick(row), 0);

const noteLatestShift = (tally: WorkerTally, shift: ShiftTimes) => {
  if (
    !tally.latest_shift ||
    shift.clock_in_at > tally.latest_shift.clock_in_at
  ) {
    tally.latest_shift = shift;
  }
};

const tallyLookup =
  (tallies: Map<string, WorkerTally>) => (userId: number, storeId: number) => {
    const key = workerKey(userId, storeId);
    const existing = tallies.get(key);
    if (existing) {
      return existing;
    }
    const created: WorkerTally = {
      clocked_in: false,
      complaint_cohort: 0,
      complaints: 0,
      days_worked: new Set(),
      in_hand: 0,
      last_move_at: null,
      latest_shift: null,
      processed_by_day: new Map(),
      qc_checks: 0,
      qc_rejects: 0,
      services_processed: 0,
      services_today: 0,
      store_id: storeId,
      user_id: userId,
    };
    tallies.set(key, created);
    return created;
  };

// A cashier clocked in to run the counter is not at the bench: her Shift and
// moves count only at a Store where she started, cleaned or holds an Item.
const benchWorkCheck = (
  tallies: Map<string, WorkerTally>,
  roleOf: (userId: number) => string | undefined,
  isBench: (tally: WorkerTally) => boolean
) => {
  const benchKeys = new Set(
    [...tallies.values()]
      .filter(isBench)
      .map((tally) => workerKey(tally.user_id, tally.store_id))
  );
  return (row: { store_id: number; user_id: number }) =>
    roleOf(row.user_id) === "worker" ||
    benchKeys.has(workerKey(row.user_id, row.store_id));
};

// `inHand` is passed only for Today: an Item in hand then counts as a day at
// the bench, while an older stretch's figures never move with what happens now.
const tallyWorkers = (
  { lines, shifts, moveDays, qcChecks }: WorkerSummaryActivity,
  roleOf: (userId: number) => string | undefined,
  inHand: WorkerLiveActivity["inHand"] = []
) => {
  const tallies = new Map<string, WorkerTally>();
  const tallyFor = tallyLookup(tallies);

  for (const line of lines) {
    if (line.started_by !== null) {
      const tally = tallyFor(line.started_by, line.store_id);
      const day = jakartaDayOf(line.processed_at);
      tally.services_processed += 1;
      tally.processed_by_day.set(
        day,
        (tally.processed_by_day.get(day) ?? 0) + 1
      );
    }
  }
  for (const row of qcChecks) {
    if (row.cleaner_id !== null) {
      const tally = tallyFor(row.cleaner_id, row.store_id);
      tally.qc_checks += row.checks;
      tally.qc_rejects += row.rejects;
    }
  }
  // Today, someone with Items in hand is on the floor even before anything
  // they started reaches QC.
  for (const row of inHand) {
    tallyFor(row.user_id, row.store_id).in_hand = row.in_hand;
  }

  const didBenchWork = benchWorkCheck(
    tallies,
    roleOf,
    (tally) =>
      tally.services_processed > 0 || tally.qc_checks > 0 || tally.in_hand > 0
  );
  for (const shift of shifts.filter(didBenchWork)) {
    const tally = tallyFor(shift.user_id, shift.store_id);
    tally.clocked_in = true;
    tally.days_worked.add(jakartaDayOf(shift.clock_in_at));
  }
  // Workers who rarely clock in still have days at the bench.
  for (const move of moveDays.filter(didBenchWork)) {
    tallyFor(move.user_id, move.store_id).days_worked.add(move.day);
  }
  return [...tallies.values()];
};

// What each person is doing right now, whatever stretch the rest of the tab
// covers: the owner looking at last week still sees who is on the floor.
const tallyLiveActivity = (
  live: WorkerLiveActivity,
  processedToday: Pick<ActivityLine, "started_by" | "store_id">[],
  roleOf: (userId: number) => string | undefined
) => {
  const tallies = new Map<string, WorkerTally>();
  const tallyFor = tallyLookup(tallies);
  for (const row of live.inHand) {
    tallyFor(row.user_id, row.store_id).in_hand = row.in_hand;
  }
  for (const line of processedToday) {
    if (line.started_by !== null) {
      tallyFor(line.started_by, line.store_id).services_today += 1;
    }
  }
  // Today's work only, so a cashier who cleaned a pair last Tuesday is not "on"
  // at the bench just because the owner picked Last 7 days.
  const movedToday = new Set(
    live.lastMoves.map((row) => workerKey(row.user_id, row.store_id))
  );
  const busyToday = benchWorkCheck(
    tallies,
    roleOf,
    (tally) => tally.in_hand > 0 || tally.services_today > 0
  );
  const isAtBench = (row: { store_id: number; user_id: number }) =>
    movedToday.has(workerKey(row.user_id, row.store_id)) || busyToday(row);
  for (const shift of live.shifts.filter(isAtBench)) {
    noteLatestShift(tallyFor(shift.user_id, shift.store_id), shift);
  }
  for (const row of live.lastMoves.filter(isAtBench)) {
    tallyFor(row.user_id, row.store_id).last_move_at = row.last_move_at;
  }
  return [...tallies.values()];
};

// Only onto rows that already exist: an Item Bayu cleaned and Citra passed on
// 1 Sep must not give Bayu an August row with nothing else on it.
const tallyComplaints = (
  tallies: WorkerTally[],
  lines: WorkerActivity["lines"]
) => {
  const byKey = new Map(
    tallies.map((tally) => [workerKey(tally.user_id, tally.store_id), tally])
  );
  for (const line of lines) {
    if (line.is_rework || line.passed_cleaner_id === null) {
      continue;
    }
    const tally = byKey.get(workerKey(line.passed_cleaner_id, line.store_id));
    if (tally) {
      tally.complaint_cohort += 1;
      tally.complaints += line.has_complaint ? 1 : 0;
    }
  }
};

// The same days the bars show: every day worked or with a Service finished.
// 0 is a day worked where nothing they started reached QC.
const dailyCounts = (tally: WorkerTally) =>
  [...new Set([...tally.days_worked, ...tally.processed_by_day.keys()])].map(
    (day) => tally.processed_by_day.get(day) ?? 0
  );

const dailySpread = (counts: number[]) => {
  if (counts.length < MIN_SPREAD_DAYS) {
    return null;
  }
  return {
    p25: round(percentile(counts, 0.25), 2),
    p75: round(percentile(counts, 0.75), 2),
  };
};

export const dailyBuckets = (from: string, to: string) => {
  const bucket: "day" | "week" =
    daysBetween(from, to) <= MAX_DAILY_BAR_DAYS ? "day" : "week";
  const bucketOf = (day: string) => (bucket === "day" ? day : weekStartOf(day));
  const labels = [...new Set(enumerateDays(from, to).map(bucketOf))];
  return { bucket, bucketOf, labels };
};

// Only Services started by someone with a day worked count towards the rate:
// a cashier who started one Item with no day at the bench has nothing to divide by.
const perDayWorked = (tallies: WorkerTally[]) => {
  const staffed = tallies.filter((tally) => tally.days_worked.size > 0);
  const daysWorked = sumBy(staffed, (tally) => tally.days_worked.size);
  const services = sumBy(staffed, (tally) => tally.services_processed);
  return daysWorked > 0 ? round(services / daysWorked, 2) : null;
};

// One person across every Store: a day at two Stores is one Day worked, and
// every Service they started counts toward the pace, even a booth's Item
// finished on a day they spent at the main Store. The Profile page uses it too.
const personFacts = (own: WorkerTally[]) => {
  const days = new Set(own.flatMap((tally) => [...tally.days_worked]));
  const services = sumBy(own, (tally) => tally.services_processed);
  return {
    services_processed: services,
    days_worked: days.size,
    per_day_worked: days.size > 0 ? round(services / days.size, 2) : null,
    qc_checks: sumBy(own, (tally) => tally.qc_checks),
    qc_rejects: sumBy(own, (tally) => tally.qc_rejects),
    complaints: sumBy(own, (tally) => tally.complaints),
    complaint_cohort: sumBy(own, (tally) => tally.complaint_cohort),
  };
};

const scopeToStore = <T extends { store_id: number }>(
  rows: T[],
  storeId: number | undefined
) =>
  storeId === undefined ? rows : rows.filter((row) => row.store_id === storeId);

const summariseWorkers = (
  activity: Pick<WorkerSummaryActivity, "lines" | "qcChecks">,
  tallies: WorkerTally[]
): WorkerSummary => {
  const spread = dailySpread(tallies.flatMap(dailyCounts));
  const qcChecks = sumBy(activity.qcChecks, (row) => row.checks);
  const qcRejects = sumBy(activity.qcChecks, (row) => row.rejects);
  const passed = activity.lines.filter(
    (line) => !line.is_rework && line.passed
  );
  const complaints = passed.filter((line) => line.has_complaint).length;
  return {
    complaints,
    complaint_cohort: passed.length,
    complaint_rate: rate(complaints, passed.length),
    services_processed: activity.lines.length,
    days_worked: sumBy(tallies, (tally) => tally.days_worked.size),
    people: new Set(
      tallies.filter((t) => t.days_worked.size > 0).map((t) => t.user_id)
    ).size,
    per_day_worked: perDayWorked(tallies) ?? 0,
    daily_p25: spread?.p25 ?? null,
    daily_p75: spread?.p75 ?? null,
    qc_checks: qcChecks,
    qc_rejects: qcRejects,
    qc_reject_rate: rate(qcRejects, qcChecks),
  };
};

const groupByService = (lines: ActivityLine[]) => {
  const byService = new Map<
    number,
    {
      service_id: number;
      service_name: string;
      service_code: string;
      lines: ActivityLine[];
    }
  >();
  for (const line of lines) {
    const serviceId = line.service_id ?? 0;
    const group = byService.get(serviceId) ?? {
      service_id: serviceId,
      service_name: line.service_name ?? "Unknown",
      service_code: line.service_code ?? "Unknown",
      lines: [],
    };
    group.lines.push(line);
    byService.set(serviceId, group);
  }
  return [...byService.values()];
};

type ServiceGroup = ReturnType<typeof groupByService>[number];

const buildServicesMatrix = (byService: ServiceGroup[]) => {
  const services: {
    service_id: number;
    service_name: string;
    total: number;
  }[] = [];
  const cells: {
    user_id: number;
    store_id: number;
    service_id: number;
    count: number;
  }[] = [];
  for (const { service_id, service_name, lines } of byService) {
    const byWorker = new Map<string, (typeof cells)[number]>();
    for (const line of lines) {
      if (line.started_by === null) {
        continue;
      }
      const key = workerKey(line.started_by, line.store_id);
      const cell = byWorker.get(key) ?? {
        user_id: line.started_by,
        store_id: line.store_id,
        service_id,
        count: 0,
      };
      cell.count += 1;
      byWorker.set(key, cell);
    }
    const workerCells = [...byWorker.values()];
    const total = sumBy(workerCells, (cell) => cell.count);
    if (total > 0) {
      services.push({ service_id, service_name, total });
      cells.push(...workerCells);
    }
  }
  return {
    services: services.toSorted(
      (a, b) =>
        b.total - a.total || a.service_name.localeCompare(b.service_name)
    ),
    cells,
  };
};

type UserRow = Awaited<ReturnType<typeof listUserNames>>[number];

const userNameOf = (user: UserRow | undefined) => user?.name ?? "Unknown";

const identityOf = (userId: number, user: UserRow | undefined) => ({
  user_id: userId,
  user_name: userNameOf(user),
  avatar_url: buildMediaUrl(user?.avatar_path),
  role: user?.role ?? "unknown",
});

const byStoreName =
  (storeName: Map<number, string>) =>
  (a: { store_id: number }, b: { store_id: number }) =>
    (storeName.get(a.store_id) ?? "").localeCompare(
      storeName.get(b.store_id) ?? ""
    );

// A Store's people in By Worker are those who clocked in there, plus those who
// never clocked in anywhere but did bench work on its Items. A GRH worker who
// also cleans the BSD booth's Items shows under GRH, not BSD.
const workedAt = (own: WorkerTally[], storeId: number) => {
  const clockedIn = own.filter((tally) => tally.clocked_in);
  const candidates = clockedIn.length > 0 ? clockedIn : own;
  return candidates.some((tally) => tally.store_id === storeId);
};

const listPeople = (
  tallies: WorkerTally[],
  storeId: number | undefined,
  userById: Map<number, UserRow>,
  storeName: Map<number, string>
) =>
  [
    ...Map.groupBy(
      tallies.toSorted(byStoreName(storeName)),
      (tally) => tally.user_id
    ).values(),
  ]
    .filter((own) => storeId === undefined || workedAt(own, storeId))
    .map((own) => {
      const userId = own[0].user_id;
      return {
        ...identityOf(userId, userById.get(userId)),
        ...personFacts(own),
        stores: own
          .filter((tally) => tally.services_processed > 0)
          .map((tally) => ({
            store_id: tally.store_id,
            services: tally.services_processed,
          }))
          .toSorted((a, b) => b.services - a.services),
        row_store_ids: own.map((tally) => tally.store_id),
        clock_in_store_ids: own
          .filter((tally) => tally.clocked_in)
          .map((tally) => tally.store_id),
      };
    })
    .toSorted(
      (a, b) =>
        b.services_processed - a.services_processed ||
        a.user_name.localeCompare(b.user_name)
    );

const liveOf = (tally: WorkerTally) => ({
  clock_in_at: tally.latest_shift?.clock_in_at ?? null,
  clock_out_at: tally.latest_shift?.clock_out_at ?? null,
  in_hand: tally.in_hand,
  last_move_at: tally.last_move_at,
  services_today: tally.services_today,
});

type LiveFigures = ReturnType<typeof liveOf>;

const shiftOf = (a: LiveFigures, b: LiveFigures) => {
  if (b.clock_in_at === null) {
    return a;
  }
  if (a.clock_in_at === null) {
    return b;
  }
  const aOpen = a.clock_out_at === null;
  if (aOpen !== (b.clock_out_at === null)) {
    return aOpen ? a : b;
  }
  return b.clock_in_at > a.clock_in_at ? b : a;
};

const laterOf = (a: Date | null, b: Date | null) => {
  if (a === null || b === null) {
    return a ?? b;
  }
  return a > b ? a : b;
};

// Someone on the GRH bench with a BSD booth pair in hand is one person on the
// floor: one Shift, every Item in hand, their latest move anywhere.
const mergeLive = (a: LiveFigures, b: LiveFigures): LiveFigures => {
  const shift = shiftOf(a, b);
  return {
    clock_in_at: shift.clock_in_at,
    clock_out_at: shift.clock_out_at,
    in_hand: a.in_hand + b.in_hand,
    last_move_at: laterOf(a.last_move_at, b.last_move_at),
    services_today: a.services_today + b.services_today,
  };
};

const liveAcross = (own: WorkerTally[]) => {
  let live = liveOf(own[0]);
  for (const tally of own.slice(1)) {
    live = mergeLive(live, liveOf(tally));
  }
  return live;
};

export const getWorkerProductivityReport = async (
  query: GetReportRangeQuery
) => {
  const ctx = buildContext(query);
  const range = getJakartaRange(ctx.from, ctx.to);
  const storeId = ctx.store_id ?? undefined;
  const today = jakartaNow().format("YYYY-MM-DD");
  const isToday = ctx.from === today && ctx.to === today;

  // Every Store's activity even with one picked: By Worker shows each person's
  // whole range.
  const [activity, prevActivity, inHand, users, stores] = await Promise.all([
    listWorkerActivity({ range }),
    listWorkerSummaryActivity({ range: ctx.previous.range, storeId }),
    isToday ? listItemsInHand({}) : [],
    listUserNames(),
    listStoreNames(),
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const storeName = new Map(stores.map((store) => [store.id, store.name]));
  const roleOf = (userId: number) => userById.get(userId)?.role;

  const everyTally = tallyWorkers(activity, roleOf, inHand);
  tallyComplaints(everyTally, activity.lines);
  const tallies = scopeToStore(everyTally, storeId);
  const lines = scopeToStore(activity.lines, storeId);
  const current = summariseWorkers(
    { lines, qcChecks: scopeToStore(activity.qcChecks, storeId) },
    tallies
  );
  const previous = summariseWorkers(
    prevActivity,
    tallyWorkers(prevActivity, roleOf)
  );

  const workers = tallies
    .map((tally) => {
      const user = userById.get(tally.user_id);
      return {
        user_id: tally.user_id,
        user_name: user?.name ?? "Unknown",
        avatar_url: buildMediaUrl(user?.avatar_path),
        role: user?.role ?? "unknown",
        store_id: tally.store_id,
        store_name: storeName.get(tally.store_id) ?? "Unknown",
        services_processed: tally.services_processed,
        days_worked: tally.days_worked.size,
        per_day_worked: perDayWorked([tally]),
        qc_checks: tally.qc_checks,
        qc_rejects: tally.qc_rejects,
        complaints: tally.complaints,
        complaint_cohort: tally.complaint_cohort,
      };
    })
    .toSorted(
      (a, b) =>
        a.store_name.localeCompare(b.store_name) ||
        b.services_processed - a.services_processed ||
        a.user_name.localeCompare(b.user_name)
    );
  const byService = groupByService(lines);
  const nameOf = (userId: number) => userNameOf(userById.get(userId));

  return {
    from: ctx.from,
    to: ctx.to,
    store_id: ctx.store_id,
    granularity: ctx.granularity,
    previous: { from: ctx.previous.from, to: ctx.previous.to },
    is_today: isToday,
    summary: {
      current,
      previous,
      deltas: buildDeltas(current, previous),
    } satisfies ComparableSummary<WorkerSummary>,
    workers,
    people: listPeople(everyTally, storeId, userById, storeName),
    // A booth with no bench of its own: who cleans its Items, busiest first.
    cleaned_by:
      storeId === undefined
        ? []
        : tallies
            .filter((tally) => tally.services_processed > 0)
            .toSorted(
              (a, b) =>
                b.services_processed - a.services_processed ||
                nameOf(a.user_id).localeCompare(nameOf(b.user_id))
            )
            .map((tally) => nameOf(tally.user_id)),
    services_matrix: buildServicesMatrix(byService),
  };
};

// A worker's own Workers tab figures for their Profile page, matching their By
// Worker row.
export const getOwnWorkerFacts = async (userId: number, range: DateRange) => {
  const activity = await listWorkerActivity({ range, userId });
  const tallies = tallyWorkers(activity, (id) =>
    id === userId ? "worker" : undefined
  );
  tallyComplaints(tallies, activity.lines);
  return personFacts(tallies.filter((tally) => tally.user_id === userId));
};

// Who is on the floor right now, apart from the range report so the Workers tab
// can ask every minute on Last 30 days without rescanning the month each time.
// Every Store is read even with one picked, for the By Worker rows.
export const getWorkerLiveReport = async ({ store_id }: GetWorkerLiveQuery) => {
  const today = jakartaNow().format("YYYY-MM-DD");
  const todayRange = getJakartaRange(today, today);
  const [live, linesToday, users, stores] = await Promise.all([
    listWorkerLiveActivity({ range: todayRange }),
    listProcessedLineStarts({ range: todayRange }),
    listUserNames(),
    listStoreNames(),
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const storeName = new Map(stores.map((store) => [store.id, store.name]));
  const roleOf = (userId: number) => userById.get(userId)?.role;
  const tallies = tallyLiveActivity(live, linesToday, roleOf);
  // A worker clocked in at GRH who cleans BSD booth Items, or a cashier on the
  // PIK counter, did clock in: any Store's Shift counts.
  const clockedIn = new Set(live.shifts.map((shift) => shift.user_id));

  return {
    workers: scopeToStore(tallies, store_id).map((tally) => ({
      ...identityOf(tally.user_id, userById.get(tally.user_id)),
      store_id: tally.store_id,
      store_name: storeName.get(tally.store_id) ?? "Unknown",
      live: {
        ...liveOf(tally),
        clocked_in_today: clockedIn.has(tally.user_id),
      },
    })),
    // One per person across every Store, for By Worker.
    people: [
      ...Map.groupBy(
        tallies.toSorted(byStoreName(storeName)),
        (tally) => tally.user_id
      ).values(),
    ].map((own) => ({
      ...identityOf(own[0].user_id, userById.get(own[0].user_id)),
      row_store_ids: own.map((tally) => tally.store_id),
      live: {
        ...liveAcross(own),
        clocked_in_today: clockedIn.has(own[0].user_id),
      },
    })),
  };
};

interface ServiceCount {
  count: number;
  service_code: string;
  service_id: number;
  service_name: string;
}

const byCountThenName = (a: ServiceCount, b: ServiceCount) =>
  b.count - a.count || a.service_name.localeCompare(b.service_name);

const countByService = (lines: ActivityLine[]): ServiceCount[] =>
  groupByService(lines)
    .map(({ service_id, service_name, service_code, lines: group }) => ({
      service_id,
      service_name,
      service_code,
      count: group.length,
    }))
    .toSorted(byCountThenName);

const groupChecksByService = (
  checks: Awaited<ReturnType<typeof listQcChecksOfCleaner>>,
  nameOf: (userId: number) => string
) => {
  const byService = new Map<
    number,
    {
      service_id: number;
      service_name: string;
      rejects: number;
      checks: number;
      items: (ItemNameFields & {
        order_id: number;
        order_service_id: number;
        rejected_at: string;
        rejected_by_name: string;
        note: string | null;
      })[];
    }
  >();
  // Newest first, so each Service's items come out newest first too.
  for (const check of checks) {
    const serviceId = check.service_id ?? 0;
    const group = byService.get(serviceId) ?? {
      service_id: serviceId,
      service_name: check.service_name ?? "Unknown",
      rejects: 0,
      checks: 0,
      items: [],
    };
    group.checks += 1;
    if (check.is_reject) {
      group.rejects += 1;
      group.items.push({
        order_id: check.order_id,
        order_service_id: check.order_service_id,
        ...pickItemName(check),
        rejected_at: check.checked_at.toISOString(),
        rejected_by_name: nameOf(check.checker_id),
        note: check.note,
      });
    }
    byService.set(serviceId, group);
  }
  return [...byService.values()]
    .filter((group) => group.rejects > 0)
    .toSorted(
      (a, b) =>
        b.rejects - a.rejects || a.service_name.localeCompare(b.service_name)
    );
};

const groupComplaintsByService = (
  cohort: ActivityLine[],
  complaintItems: Awaited<ReturnType<typeof listComplaintItems>>
) => {
  const itemByLine = new Map(
    complaintItems.map((item) => [item.order_service_id, item])
  );
  return groupByService(cohort)
    .map(({ service_id, service_name, lines }) => ({
      service_id,
      service_name,
      complaints: lines.filter((line) => line.has_complaint).length,
      finished: lines.length,
      items: lines
        .flatMap((line) => itemByLine.get(line.order_service_id) ?? [])
        .toSorted(
          (a, b) =>
            b.created_at.getTime() - a.created_at.getTime() ||
            b.complaint_id - a.complaint_id
        )
        .map((item) => ({
          complaint_id: item.complaint_id,
          order_id: item.order_id,
          order_service_id: item.order_service_id,
          ...pickItemName(item),
          opened_at: item.created_at.toISOString(),
          reason: item.reason,
          outcome: complaintOutcome(item),
        })),
    }))
    .filter((group) => group.complaints > 0)
    .toSorted(
      (a, b) =>
        b.complaints - a.complaints ||
        a.service_name.localeCompare(b.service_name)
    );
};

// One person at one Store, or across every Store with none picked: the page
// behind a row of the Workers tab. Everything is built from the same tallies as
// that row, so the two never disagree.
// oxlint-disable-next-line eslint/complexity -- one page's worth of figures built in one pass; splitting it would only move the branches
export const getWorkerDetailReport = async (query: GetWorkerDetailQuery) => {
  const { from, to, store_id: storeId, user_id: userId } = query;
  const range = getJakartaRange(from, to);
  // Same Today rule as the row: an Item in hand counts as a day at the bench.
  const today = jakartaNow().format("YYYY-MM-DD");
  const isToday = from === today && to === today;

  const [activity, inHand, checks, users, stores] = await Promise.all([
    // A Store's sheet needs the whole team for its average; one across every
    // Store has none, so it reads only this person's work.
    listWorkerActivity(
      storeId === undefined ? { range, userId } : { range, storeId }
    ),
    isToday ? listItemsInHand({ storeId }) : [],
    listQcChecksOfCleaner({ range, storeId, userId }),
    listUserNames(),
    listStoreNames(),
  ]);
  const userById = new Map(users.map((candidate) => [candidate.id, candidate]));
  const storeName = new Map(stores.map((store) => [store.id, store.name]));
  const user = userById.get(userId);
  if (!user) {
    throw new NotFoundException("User not found");
  }
  const roleOf = (id: number) => userById.get(id)?.role;

  const tallies = tallyWorkers(activity, roleOf, inHand);
  tallyComplaints(tallies, activity.lines);
  const mine = tallies
    .filter((t) => t.user_id === userId)
    .toSorted(byStoreName(storeName));
  const myStoreIds = new Set(mine.map((t) => t.store_id));

  const { bucket, bucketOf, labels } = dailyBuckets(from, to);
  const bucketTotals = (t: WorkerTally) => {
    const processed = new Map<string, number>();
    for (const [day, count] of t.processed_by_day) {
      const label = bucketOf(day);
      processed.set(label, (processed.get(label) ?? 0) + count);
    }
    return { processed, worked: new Set([...t.days_worked].map(bucketOf)) };
  };

  const myWorked = new Set(
    mine.flatMap((t) => [...t.days_worked].map(bucketOf))
  );
  // A Store average means nothing across every Store.
  const colleagues =
    storeId === undefined
      ? []
      : tallies.filter((t) => roleOf(t.user_id) === "worker").map(bucketTotals);
  const myLines = activity.lines.filter((line) => line.started_by === userId);
  const myLinesByBucket = new Map<string, typeof myLines>();
  for (const line of myLines) {
    const label = bucketOf(jakartaDayOf(line.processed_at));
    const group = myLinesByBucket.get(label);
    if (group) {
      group.push(line);
    } else {
      myLinesByBucket.set(label, [line]);
    }
  }
  const buckets = labels.map((label) => {
    const inBucket = myLinesByBucket.get(label) ?? [];
    const worked = myWorked.has(label);
    const crew = colleagues.filter(
      (c) => c.worked.has(label) || (c.processed.get(label) ?? 0) > 0
    );
    return {
      label,
      worked,
      total: inBucket.length > 0 || worked ? inBucket.length : null,
      services: countByService(inBucket),
      // By the Order's Store, so a day at GRH cleaning BSD Items shows both.
      by_store: [...myStoreIds].flatMap((id) => {
        const count = inBucket.filter((line) => line.store_id === id).length;
        return count > 0 ? [{ store_id: id, count }] : [];
      }),
      store_average:
        crew.length > 0
          ? round(
              sumBy(crew, (c) => c.processed.get(label) ?? 0) / crew.length,
              2
            )
          : null,
    };
  });

  const qcRejects = groupChecksByService(
    checks,
    (id) => userById.get(id)?.name ?? "—"
  );

  // Same cohort and same guard as tallyComplaints: no row, no Complaints.
  const cohort = activity.lines.filter(
    (line) =>
      !line.is_rework &&
      line.passed_cleaner_id === userId &&
      myStoreIds.has(line.store_id)
  );
  const complained = cohort.filter((line) => line.has_complaint);
  const complaintItems =
    complained.length > 0
      ? await listComplaintItems(
          complained.map((line) => line.order_service_id)
        )
      : [];

  return {
    from,
    to,
    store_id: storeId ?? null,
    store_name:
      storeId === undefined ? null : (storeName.get(storeId) ?? "Unknown"),
    user_id: userId,
    user_name: user.name,
    role: user.role,
    bucket,
    facts: personFacts(mine),
    stores: mine
      .filter((t) => t.services_processed > 0)
      .map((t) => ({
        store_id: t.store_id,
        store_name: storeName.get(t.store_id) ?? "Unknown",
        services: t.services_processed,
      }))
      .toSorted((a, b) => b.services - a.services),
    buckets,
    services: countByService(myLines),
    qc_rejects: qcRejects,
    complaints: groupComplaintsByService(cohort, complaintItems),
  };
};

export const getCampaignEffectivenessReport = async (
  query: GetReportRangeQuery
) => {
  const ctx = buildContext(query);
  const range = getJakartaRange(ctx.from, ctx.to);
  const storeId = ctx.store_id ?? undefined;

  const rows = await listCampaignEffectivenessRows({ range, storeId });

  const totals = {
    orders: sumBy(rows, (row) => row.orders),
    collected: sumBy(rows, (row) => row.collected),
    discount_cost: sumBy(rows, (row) => row.discount_cost),
  };

  return {
    from: ctx.from,
    to: ctx.to,
    store_id: ctx.store_id,
    granularity: ctx.granularity,
    campaigns: rows,
    summary: totals,
  };
};
