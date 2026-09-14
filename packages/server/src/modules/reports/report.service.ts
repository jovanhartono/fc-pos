import { revenue } from "@/modules/reports/money-basis";
import {
  categoryGrossSalesForRange,
  countAgingQueue,
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
import {
  getJakartaDayRange,
  shiftDate,
} from "@/modules/reports/report-range.util";
import { countServicesProcessed } from "@/modules/reports/services-processed";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";

export async function getDailyReport(query: GetDailyReportQuery) {
  const range = getJakartaDayRange(query.date);
  const storeId = query.store_id;

  const [paid, refunds, servicesProcessed, ordersIn, ordersOut] =
    await Promise.all([
      sumDailyPaid({ range, storeId }),
      sumDailyRefunds({ range, storeId }),
      countServicesProcessed({ range, storeId }),
      countDailyOrdersIn({ range, storeId }),
      countDailyOrdersOut({ range, storeId }),
    ]);

  return {
    date: query.date,
    store_id: storeId ?? null,
    revenue: revenue(paid, refunds),
    services_processed: servicesProcessed,
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
    categoryGrossSalesForRange({ range: dayRange, storeId }),
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
      revenue: revenue(paidByDay.get(day) ?? 0, refundedByDay.get(day) ?? 0),
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
