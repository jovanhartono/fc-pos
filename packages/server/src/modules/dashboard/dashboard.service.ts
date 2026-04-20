import {
  countActiveQueueAtMoment,
  countExpiredActiveCampaigns,
  countLowStockProducts,
  countOrdersInRange,
  countPickupsInRange,
  countUnclaimedOrders,
  findOldestOpenOrder,
  getEntityCounts,
  perStoreToday,
  sumPaidInRange,
  sumRefundsInRange,
  topServicesInRange,
} from "@/modules/dashboard/dashboard.repository";
import type { GetDashboardOverviewQuery } from "@/modules/dashboard/dashboard.schema";

// Asia/Jakarta is UTC+7 year-round.
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

function getJakartaTodayDate(now: Date): string {
  const jakartaMs = now.getTime() + JAKARTA_OFFSET_MINUTES * 60_000;
  const jakartaDate = new Date(jakartaMs);
  const year = jakartaDate.getUTCFullYear();
  const month = String(jakartaDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jakartaDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function deltaPct(today: number, yesterday: number): number | null {
  if (yesterday === 0) {
    return today === 0 ? 0 : null;
  }
  const pct = ((today - yesterday) / yesterday) * 100;
  return Math.round(pct * 10) / 10;
}

function buildKpi(today: number, yesterday: number) {
  return {
    today,
    yesterday,
    delta_pct: deltaPct(today, yesterday),
  };
}

export function getDashboardCounts() {
  return getEntityCounts();
}

export async function getDashboardOverview(query: GetDashboardOverviewQuery) {
  const now = new Date();
  const dateStr = query.date ?? getJakartaTodayDate(now);
  const [year, month, day] = dateStr.split("-").map(Number);
  const yesterdayDate = new Date(Date.UTC(year, month - 1, day - 1));
  const yesterdayStr = `${yesterdayDate.getUTCFullYear()}-${String(yesterdayDate.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getUTCDate()).padStart(2, "0")}`;

  const weekStartDate = new Date(Date.UTC(year, month - 1, day - 6));
  const weekStartStr = `${weekStartDate.getUTCFullYear()}-${String(weekStartDate.getUTCMonth() + 1).padStart(2, "0")}-${String(weekStartDate.getUTCDate()).padStart(2, "0")}`;

  const todayRange = getJakartaDayRange(dateStr);
  const yesterdayRange = getJakartaDayRange(yesterdayStr);
  const weekRange = {
    start: getJakartaDayRange(weekStartStr).start,
    end: todayRange.end,
  };

  const [
    paidToday,
    paidYesterday,
    refundedToday,
    refundedYesterday,
    ordersInToday,
    ordersInYesterday,
    ordersOutToday,
    ordersOutYesterday,
    queueDepthNow,
    queueDepthYesterday,
    perStore,
    topServices,
    oldestOpenOrder,
    unclaimedOrdersCount,
    lowStockProductsCount,
    expiredCampaignsCount,
  ] = await Promise.all([
    sumPaidInRange(todayRange),
    sumPaidInRange(yesterdayRange),
    sumRefundsInRange(todayRange),
    sumRefundsInRange(yesterdayRange),
    countOrdersInRange(todayRange),
    countOrdersInRange(yesterdayRange),
    countPickupsInRange(todayRange),
    countPickupsInRange(yesterdayRange),
    countActiveQueueAtMoment(todayRange.end),
    countActiveQueueAtMoment(yesterdayRange.end),
    perStoreToday(todayRange),
    topServicesInRange(weekRange),
    findOldestOpenOrder(now),
    countUnclaimedOrders(now),
    countLowStockProducts(),
    countExpiredActiveCampaigns(now),
  ]);

  return {
    date: dateStr,
    kpi: {
      revenue: buildKpi(
        paidToday - refundedToday,
        paidYesterday - refundedYesterday
      ),
      orders_in: buildKpi(ordersInToday, ordersInYesterday),
      orders_out: buildKpi(ordersOutToday, ordersOutYesterday),
      queue_depth: buildKpi(queueDepthNow, queueDepthYesterday),
    },
    per_store_today: perStore,
    top_services_week: topServices,
    risks: {
      oldest_open_order: oldestOpenOrder,
      unclaimed_orders_count: unclaimedOrdersCount,
      low_stock_products_count: lowStockProductsCount,
      expired_campaigns_count: expiredCampaignsCount,
    },
  };
}
