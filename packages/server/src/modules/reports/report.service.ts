import {
  categoryRevenueForRange,
  countAgingQueue,
  countDailyItemsProcessed,
  countDailyOrdersIn,
  countDailyOrdersOut,
  listAgingQueue,
  ordersInTrendSeries,
  ordersOutTrendSeries,
  paidTrendSeries,
  perStoreForRange,
  refundsTrendSeries,
  sumDailyPaid,
  sumDailyRefunds,
  topServicesForRange,
} from "@/modules/reports/report.repository";
import type {
  GetAgingQueueQuery,
  GetDailyReportQuery,
  GetReportOverviewQuery,
} from "@/modules/reports/report.schema";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";

// Asia/Jakarta is UTC+7 year-round (no DST).
const JAKARTA_OFFSET_MINUTES = 7 * 60;
const DAY_MS = 86_400_000;

function getJakartaDayRange(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const startUtcMs =
    Date.UTC(year, month - 1, day, 0, 0, 0) - JAKARTA_OFFSET_MINUTES * 60_000;
  const start = new Date(startUtcMs);
  const end = new Date(startUtcMs + DAY_MS);
  return { start, end };
}

function shiftDate(date: string, deltaDays: number) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export async function getDailyReport(query: GetDailyReportQuery) {
  const range = getJakartaDayRange(query.date);
  const storeId = query.store_id;

  const [paid, refunded, itemsProcessed, ordersIn, ordersOut] =
    await Promise.all([
      sumDailyPaid({ range, storeId }),
      sumDailyRefunds({ range, storeId }),
      countDailyItemsProcessed({ range, storeId }),
      countDailyOrdersIn({ range, storeId }),
      countDailyOrdersOut({ range, storeId }),
    ]);

  return {
    date: query.date,
    store_id: storeId ?? null,
    revenue: paid - refunded,
    items_processed: itemsProcessed,
    orders_in: ordersIn,
    orders_out: ordersOut,
  };
}

export async function getReportOverview(query: GetReportOverviewQuery) {
  const dayRange = getJakartaDayRange(query.date);
  const storeId = query.store_id;
  const trendDays = query.trend_days;

  const trendStartDate = shiftDate(query.date, -(trendDays - 1));
  const trendRange = {
    start: getJakartaDayRange(trendStartDate).start,
    end: dayRange.end,
  };

  const [
    daily,
    ordersInTrend,
    ordersOutTrend,
    paidTrend,
    refundsTrend,
    categories,
    topServices,
    perStore,
  ] = await Promise.all([
    getDailyReport({ date: query.date, store_id: storeId }),
    ordersInTrendSeries({ range: trendRange, storeId }),
    ordersOutTrendSeries({ range: trendRange, storeId }),
    paidTrendSeries({ range: trendRange, storeId }),
    refundsTrendSeries({ range: trendRange, storeId }),
    categoryRevenueForRange({ range: dayRange, storeId }),
    topServicesForRange({ range: dayRange, storeId }),
    perStoreForRange({ range: dayRange }),
  ]);

  const ordersInByDay = new Map(ordersInTrend.map((row) => [row.day, row]));
  const ordersOutByDay = new Map(ordersOutTrend.map((row) => [row.day, row]));
  const paidByDay = new Map(paidTrend.map((row) => [row.day, row.paid]));
  const refundedByDay = new Map(
    refundsTrend.map((row) => [row.day, row.refunded])
  );

  const trend = Array.from({ length: trendDays }, (_, index) => {
    const day = shiftDate(trendStartDate, index);
    return {
      date: day,
      orders_in: ordersInByDay.get(day)?.orders_in ?? 0,
      orders_out: ordersOutByDay.get(day)?.orders_out ?? 0,
      revenue: (paidByDay.get(day) ?? 0) - (refundedByDay.get(day) ?? 0),
    };
  });

  return {
    date: query.date,
    store_id: storeId ?? null,
    trend_days: trendDays,
    daily,
    trend,
    categories,
    top_services: topServices,
    per_store: perStore,
  };
}

export async function getAgingQueueReport(query?: GetAgingQueueQuery) {
  const pagination = normalizePagination(query, { maxPageSize: 200 });
  const filters = { storeId: query?.store_id };

  const [items, total] = await Promise.all([
    listAgingQueue({
      filters,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    countAgingQueue(filters),
  ]);

  return {
    items,
    meta: buildPaginationMeta(total, pagination),
  };
}
