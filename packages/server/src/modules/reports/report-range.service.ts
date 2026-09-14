import { revenue } from "@/modules/reports/money-basis";
import type {
  ComparableSummary,
  GetReportRangeQuery,
  KpiDelta,
} from "@/modules/reports/report.schema";
import {
  findCumulativeCustomersBefore,
  findDistinctHandlerCount,
  findRepeatCustomerStats,
  listCampaignEffectivenessRows,
  listCategoryGrossSalesSeries,
  listCollectedSeries,
  listNewCustomersSeries,
  listOrderDiscountSeries,
  listOrdersInSeries,
  listOrdersOutSeries,
  listPaymentMixSeries,
  listProductsCogsSeries,
  listProductsGrossSalesSeries,
  listRefundAmountSeries,
  listRefundReasonSeries,
  listReturningCustomerOrdersSeries,
  listServicesCogsSeries,
  listServicesGrossSalesSeries,
  listStoreCategoryGrossSalesRows,
  listStoreCollectedRows,
  listStoreRefundRows,
  listTopCustomers,
  listWorkerProductivityRows,
} from "@/modules/reports/report-range.repository";
import {
  deltaPct,
  derivePreviousRange,
  enumerateBuckets,
  type Granularity,
  getJakartaRange,
  indexBy,
  pickGranularity,
} from "@/modules/reports/report-range.util";

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

function buildContext(query: GetReportRangeQuery): ReportContext {
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
}

function kpi<T extends number>(current: T, previous: T): KpiDelta<T> {
  return {
    current,
    previous,
    delta_pct: deltaPct(current, previous),
  };
}

function buildDeltas<T extends object>(
  current: T,
  previous: T
): ComparableSummary<T>["deltas"] {
  const deltas: Record<string, KpiDelta> = {};
  for (const key of Object.keys(current) as (keyof T)[]) {
    const c = current[key];
    const p = previous[key];
    if (typeof c === "number" && typeof p === "number") {
      deltas[key as string] = kpi(c, p);
    }
  }
  return deltas as ComparableSummary<T>["deltas"];
}

// ───────────────────────── Financial ─────────────────────────

interface FinancialSummary {
  cogs: number;
  collected: number;
  discount: number;
  gross_profit: number;
  gross_sales: number;
  margin: number;
  products_gross_sales: number;
  refunds: number;
  revenue: number;
  services_gross_sales: number;
}

async function financialSummaryFor({
  range,
  storeId,
  granularity,
}: {
  range: ReturnType<typeof getJakartaRange>;
  storeId?: number;
  granularity: Granularity;
}) {
  const [
    services,
    products,
    servicesCogs,
    productsCogs,
    discount,
    collected,
    refunds,
  ] = await Promise.all([
    listServicesGrossSalesSeries({ range, storeId, granularity }),
    listProductsGrossSalesSeries({ range, storeId, granularity }),
    listServicesCogsSeries({ range, storeId, granularity }),
    listProductsCogsSeries({ range, storeId, granularity }),
    listOrderDiscountSeries({ range, storeId, granularity }),
    listCollectedSeries({ range, storeId, granularity }),
    listRefundAmountSeries({ range, storeId, granularity }),
  ]);
  return {
    services,
    products,
    servicesCogs,
    productsCogs,
    discount,
    collected,
    refunds,
  };
}

// A store that took nothing this stretch but handed money back still needs a
// line of its own, or the store rows stop adding up to the range's Revenue.
function mergeStoreRows(
  collectedRows: Awaited<ReturnType<typeof listStoreCollectedRows>>,
  refundRows: Awaited<ReturnType<typeof listStoreRefundRows>>
) {
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
  return Array.from(byStore.values()).map((row) => ({
    ...row,
    revenue: revenue(row.collected, row.refunds),
  }));
}

export async function getFinancialReport(query: GetReportRangeQuery) {
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
  ]);

  const servicesMap = indexBy(current.services);
  const productsMap = indexBy(current.products);
  const servicesCogsMap = indexBy(current.servicesCogs);
  const productsCogsMap = indexBy(current.productsCogs);
  const discountMap = indexBy(current.discount);
  const collectedMap = indexBy(current.collected);
  const refundsMap = indexBy(current.refunds);

  const series = ctx.buckets.map((bucket) => {
    const s = servicesMap.get(bucket)?.gross_sales ?? 0;
    const p = productsMap.get(bucket)?.gross_sales ?? 0;
    const sc = servicesCogsMap.get(bucket)?.cogs ?? 0;
    const pc = productsCogsMap.get(bucket)?.cogs ?? 0;
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

  // Category treemap
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
  const topCategories = Array.from(categoryTotals.values())
    .sort((a, b) => b.gross_sales - a.gross_sales)
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

  const categoryTreemap = Array.from(categoryTotals.values()).sort(
    (a, b) => b.gross_sales - a.gross_sales
  );

  const storeRows = mergeStoreRows(storeCollected, storeRefunds);
  const grandStoreRevenue = storeRows.reduce((s, r) => s + r.revenue, 0);
  const storeBreakdown = storeRows
    .map((row) => ({
      ...row,
      share: grandStoreRevenue > 0 ? row.revenue / grandStoreRevenue : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Store × Category matrix: global top N columns, "Other" collapses rest
  const STORE_CATEGORY_TOP_N = 6;
  const STORE_CATEGORY_MAX_STORES = 12;
  const OTHER_CATEGORY_ID = -1;

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

  const globalSorted = Array.from(globalCategoryTotals.entries())
    .map(([id, c]) => ({
      category_id: id,
      label: c.label,
      gross_sales: c.gross_sales,
    }))
    .sort(
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

  const sortedStoreBuckets = Array.from(storeBuckets.values()).sort(
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
    summary: {
      current: summary,
      previous: prevSummary,
      deltas: buildDeltas(summary, prevSummary),
    } satisfies ComparableSummary<FinancialSummary>,
  };
}

function summariseFinancial(raw: {
  services: { gross_sales: number }[];
  products: { gross_sales: number }[];
  servicesCogs: { cogs: number }[];
  productsCogs: { cogs: number }[];
  discount: { discount: number }[];
  collected: { collected: number }[];
  refunds: { amount: number }[];
}): FinancialSummary {
  const servicesGrossSales = raw.services.reduce(
    (s, r) => s + r.gross_sales,
    0
  );
  const productsGrossSales = raw.products.reduce(
    (s, r) => s + r.gross_sales,
    0
  );
  const cogs =
    raw.servicesCogs.reduce((s, r) => s + r.cogs, 0) +
    raw.productsCogs.reduce((s, r) => s + r.cogs, 0);
  const discount = raw.discount.reduce((s, r) => s + r.discount, 0);
  const collected = raw.collected.reduce((s, r) => s + r.collected, 0);
  const refunds = raw.refunds.reduce((s, r) => s + r.amount, 0);
  const kept = revenue(collected, refunds);
  const grossProfit = kept - cogs;
  return {
    gross_sales: servicesGrossSales + productsGrossSales,
    services_gross_sales: servicesGrossSales,
    products_gross_sales: productsGrossSales,
    discount,
    collected,
    refunds,
    revenue: kept,
    cogs,
    gross_profit: grossProfit,
    margin: kept > 0 ? grossProfit / kept : 0,
  };
}

// ───────────────────────── Orders flow ─────────────────────────

interface OrdersFlowSummary {
  distinct_handlers: number;
  net_flow: number;
  orders_in_total: number;
  orders_out_total: number;
  throughput_per_handler: number;
}

export async function getOrdersFlowReport(query: GetReportRangeQuery) {
  const ctx = buildContext(query);
  const range = getJakartaRange(ctx.from, ctx.to);
  const storeId = ctx.store_id ?? undefined;

  const [ordersIn, ordersOut, prevIn, prevOut, handlers, prevHandlers] =
    await Promise.all([
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
      findDistinctHandlerCount({ range, storeId }),
      findDistinctHandlerCount({ range: ctx.previous.range, storeId }),
    ]);

  const inMap = indexBy(ordersIn);
  const outMap = indexBy(ordersOut);
  const series = ctx.buckets.map((bucket) => ({
    bucket,
    orders_in: inMap.get(bucket)?.orders_in ?? 0,
    orders_out: outMap.get(bucket)?.orders_out ?? 0,
  }));

  const summary = ordersFlowSummaryFrom(ordersIn, ordersOut, handlers);
  const prevSummary = ordersFlowSummaryFrom(prevIn, prevOut, prevHandlers);

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
}

function ordersFlowSummaryFrom(
  ordersIn: { orders_in: number }[],
  ordersOut: { orders_out: number }[],
  handlers: number
): OrdersFlowSummary {
  const inTotal = ordersIn.reduce((s, r) => s + r.orders_in, 0);
  const outTotal = ordersOut.reduce((s, r) => s + r.orders_out, 0);
  return {
    orders_in_total: inTotal,
    orders_out_total: outTotal,
    net_flow: inTotal - outTotal,
    distinct_handlers: handlers,
    throughput_per_handler: handlers > 0 ? outTotal / handlers : 0,
  };
}

// ───────────────────────── Payment mix ─────────────────────────

export async function getPaymentMixReport(query: GetReportRangeQuery) {
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
        collected: row.collected,
        orders: row.orders,
      });
    }
  }

  const methods = Array.from(methodTotals.values()).sort(
    (a, b) => b.collected - a.collected
  );
  const methodKeys = methods.map((m) => ({
    key: `pm_${m.payment_method_id}`,
    label: m.payment_method_name,
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
}

// ───────────────────────── Customer acquisition ─────────────────────────

interface CustomerSummary {
  active_customers_in_range: number;
  cumulative_end: number;
  cumulative_start: number;
  new_customers: number;
  repeat_customers_in_range: number;
  repeat_rate: number;
}

export async function getCustomerAcquisitionReport(query: GetReportRangeQuery) {
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
}

function customerSummary(
  series: { new_customers: number; cumulative: number }[],
  priorTotal: number,
  repeat: { total_customers: number; repeat_customers: number }
): CustomerSummary {
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
}

// ───────────────────────── Refund trend ─────────────────────────

export async function getRefundTrendReport(query: GetReportRangeQuery) {
  const ctx = buildContext(query);
  const range = getJakartaRange(ctx.from, ctx.to);
  const storeId = ctx.store_id ?? undefined;

  const [amounts, reasons] = await Promise.all([
    listRefundAmountSeries({ range, storeId, granularity: ctx.granularity }),
    listRefundReasonSeries({ range, storeId, granularity: ctx.granularity }),
  ]);

  const amountMap = indexBy(amounts);
  const series = ctx.buckets.map((bucket) => ({
    bucket,
    amount: amountMap.get(bucket)?.amount ?? 0,
    refunds: amountMap.get(bucket)?.refunds ?? 0,
  }));

  const reasonKeys = ["damaged", "cannot_process", "lost", "other"] as const;
  const reasonBucketMap = new Map<string, Record<string, number>>();
  for (const row of reasons) {
    const bucketRow = reasonBucketMap.get(row.bucket) ?? {};
    bucketRow[row.reason] = (bucketRow[row.reason] ?? 0) + row.amount;
    reasonBucketMap.set(row.bucket, bucketRow);
  }
  const reasonSeries = ctx.buckets.map((bucket) => {
    const row = reasonBucketMap.get(bucket) ?? {};
    const filled: Record<string, number | string> = { bucket };
    for (const reason of reasonKeys) {
      filled[reason] = row[reason] ?? 0;
    }
    return filled;
  });

  const reasonTotals: Record<string, { amount: number; items: number }> = {
    damaged: { amount: 0, items: 0 },
    cannot_process: { amount: 0, items: 0 },
    lost: { amount: 0, items: 0 },
    other: { amount: 0, items: 0 },
  };
  for (const row of reasons) {
    reasonTotals[row.reason].amount += row.amount;
    reasonTotals[row.reason].items += row.items;
  }

  const grandTotal = series.reduce((s, r) => s + r.amount, 0);
  const totalRefunds = series.reduce((s, r) => s + r.refunds, 0);

  return {
    from: ctx.from,
    to: ctx.to,
    store_id: ctx.store_id,
    granularity: ctx.granularity,
    series,
    reason_series: reasonSeries,
    reason_keys: reasonKeys.map((key) => ({ key, label: key })),
    summary: {
      total_amount: grandTotal,
      total_refunds: totalRefunds,
      reason_totals: reasonTotals,
    },
  };
}

// ───────────────────────── Worker productivity ─────────────────────────

interface WorkerSummary {
  avg_services_per_hour: number;
  rework_rate: number;
  total_refund_items: number;
  total_rework_items: number;
  total_services_processed: number;
  worker_count: number;
}

export async function getWorkerProductivityReport(query: GetReportRangeQuery) {
  const ctx = buildContext(query);
  const range = getJakartaRange(ctx.from, ctx.to);
  const storeId = ctx.store_id ?? undefined;

  const [rows, prevRows] = await Promise.all([
    listWorkerProductivityRows({ range, storeId }),
    listWorkerProductivityRows({ range: ctx.previous.range, storeId }),
  ]);

  const current = summariseWorkers(rows);
  const previous = summariseWorkers(prevRows);

  return {
    from: ctx.from,
    to: ctx.to,
    store_id: ctx.store_id,
    granularity: ctx.granularity,
    previous: { from: ctx.previous.from, to: ctx.previous.to },
    workers: rows,
    summary: {
      current,
      previous,
      deltas: buildDeltas(current, previous),
    } satisfies ComparableSummary<WorkerSummary>,
  };
}

function summariseWorkers(
  rows: Awaited<ReturnType<typeof listWorkerProductivityRows>>
): WorkerSummary {
  const active = rows.filter(
    (r) => r.services_processed > 0 || r.shift_minutes > 0 || r.rework_items > 0
  );
  const totalProcessed = active.reduce((s, r) => s + r.services_processed, 0);
  const totalRefunds = active.reduce((s, r) => s + r.refund_items, 0);
  const totalRework = active.reduce((s, r) => s + r.rework_items, 0);
  const totalHours = active.reduce((s, r) => s + r.shift_minutes / 60, 0);
  return {
    worker_count: active.length,
    total_services_processed: totalProcessed,
    total_refund_items: totalRefunds,
    total_rework_items: totalRework,
    rework_rate: totalProcessed > 0 ? totalRework / totalProcessed : 0,
    avg_services_per_hour: totalHours > 0 ? totalProcessed / totalHours : 0,
  };
}

// ───────────────────────── Campaign effectiveness ─────────────────────────

export async function getCampaignEffectivenessReport(
  query: GetReportRangeQuery
) {
  const ctx = buildContext(query);
  const range = getJakartaRange(ctx.from, ctx.to);
  const storeId = ctx.store_id ?? undefined;

  const rows = await listCampaignEffectivenessRows({ range, storeId });

  const totals = rows.reduce(
    (acc, row) => {
      acc.orders += row.orders;
      acc.collected += row.collected;
      acc.discount_cost += row.discount_cost;
      return acc;
    },
    { orders: 0, collected: 0, discount_cost: 0 }
  );

  return {
    from: ctx.from,
    to: ctx.to,
    store_id: ctx.store_id,
    granularity: ctx.granularity,
    campaigns: rows,
    summary: totals,
  };
}
