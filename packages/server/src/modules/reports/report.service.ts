import {
  countDailyItemsProcessed,
  countDailyOrdersIn,
  countDailyOrdersOut,
  sumDailyRevenue,
} from "@/modules/reports/report.repository";
import type { GetDailyReportQuery } from "@/modules/reports/report.schema";

// Asia/Jakarta is UTC+7 year-round (no DST).
const JAKARTA_OFFSET_MINUTES = 7 * 60;

function getJakartaDayRange(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const startUtcMs =
    Date.UTC(year, month - 1, day, 0, 0, 0) - JAKARTA_OFFSET_MINUTES * 60_000;
  const start = new Date(startUtcMs);
  const end = new Date(startUtcMs + 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function getDailyReport(query: GetDailyReportQuery) {
  const range = getJakartaDayRange(query.date);
  const storeId = query.store_id;

  const [revenue, itemsProcessed, ordersIn, ordersOut] = await Promise.all([
    sumDailyRevenue({ range, storeId }),
    countDailyItemsProcessed({ range, storeId }),
    countDailyOrdersIn({ range, storeId }),
    countDailyOrdersOut({ range, storeId }),
  ]);

  return {
    date: query.date,
    store_id: storeId ?? null,
    revenue,
    items_processed: itemsProcessed,
    orders_in: ordersIn,
    orders_out: ordersOut,
  };
}
