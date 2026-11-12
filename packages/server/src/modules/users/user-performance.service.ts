import type { Dayjs } from "dayjs";
import { getOwnWorkerFacts } from "@/modules/reports/report-range.service";
import {
  type DateRange,
  derivePreviousRange,
  getJakartaRange,
} from "@/modules/reports/report-range.util";
import type { PerformancePeriod } from "@/modules/users/user.schema";
import {
  countCollectedBy,
  countOrdersCreatedBy,
  countPickupNoticesSentBy,
  countPickupsHandedOverBy,
  countQcChecksDoneBy,
  countShiftDays,
} from "@/modules/users/user-performance.repository";
import type { AuthUser } from "@/types";
import { jakartaNow } from "@/utils/date";

const DAY = "YYYY-MM-DD";

interface Window {
  from: string;
  to: string;
}

const windowOf = (from: Dayjs, to: Dayjs): Window => ({
  from: from.format(DAY),
  to: to.format(DAY),
});

// Each period is set against the one before it. This Month so far meets the same
// days of last month, so the 12th isn't judged against a whole month.
export function performanceWindows(period: PerformancePeriod, today: Dayjs) {
  if (period === "last_7_days") {
    const current = windowOf(today.subtract(6, "day"), today);
    return {
      current,
      previous: derivePreviousRange(current.from, current.to),
    };
  }

  const thisMonth = today.startOf("month");
  const lastMonth = thisMonth.subtract(1, "month");
  if (period === "this_month") {
    const sameDay = lastMonth.add(today.date() - 1, "day");
    const lastMonthEnd = lastMonth.endOf("month");
    return {
      current: windowOf(thisMonth, today),
      previous: windowOf(
        lastMonth,
        sameDay.isAfter(lastMonthEnd) ? lastMonthEnd : sameDay
      ),
    };
  }

  const monthBefore = lastMonth.subtract(1, "month");
  return {
    current: windowOf(lastMonth, lastMonth.endOf("month")),
    previous: windowOf(monthBefore, monthBefore.endOf("month")),
  };
}

const rangeOf = ({ from, to }: Window) => getJakartaRange(from, to);

async function cashierFacts(userId: number, range: DateRange) {
  const [ordersCreated, pickups, pickupNotices, shiftDays, qcChecksDone] =
    await Promise.all([
      countOrdersCreatedBy(userId, range),
      countPickupsHandedOverBy(userId, range),
      countPickupNoticesSentBy(userId, range),
      countShiftDays(userId, range),
      countQcChecksDoneBy(userId, range),
    ]);
  return {
    orders_created: ordersCreated,
    pickups,
    pickup_notices: pickupNotices,
    shift_days: shiftDays,
    qc_checks_done: qcChecksDone,
  };
}

async function courierFacts(userId: number, range: DateRange) {
  const collected = await countCollectedBy(userId, range);
  return {
    orders_collected: collected.orders,
    items_collected: collected.items,
  };
}

async function compare<T>(
  windows: { current: Window; previous: Window },
  facts: (range: DateRange) => Promise<T>
) {
  const [current, previous] = await Promise.all([
    facts(rangeOf(windows.current)),
    facts(rangeOf(windows.previous)),
  ]);
  return {
    previous_window: windows.previous,
    current,
    previous,
  };
}

// The signed-in person's own figures. Admins have Reports, so they get none.
export async function getOwnPerformance({
  userId,
  role,
  period,
}: {
  userId: number;
  role: AuthUser["role"];
  period: PerformancePeriod;
}) {
  const windows = performanceWindows(period, jakartaNow());

  if (role === "worker") {
    return {
      role: "worker" as const,
      ...(await compare(windows, (range) => getOwnWorkerFacts(userId, range))),
    };
  }
  if (role === "cashier") {
    return {
      role: "cashier" as const,
      ...(await compare(windows, (range) => cashierFacts(userId, range))),
    };
  }
  if (role === "courier") {
    return {
      role: "courier" as const,
      ...(await compare(windows, (range) => courierFacts(userId, range))),
    };
  }
  return { role: "admin" as const };
}
