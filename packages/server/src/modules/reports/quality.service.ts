import type { RangeArgs } from "@/modules/reports/money-basis";
import {
  countQcRejects,
  findWaitingQcNow,
  listDamagedLostRefunds,
  listQcArrivalsByDay,
  listQcRejects,
  listQualityChecksByChecker,
  listQualityChecksByCheckerDay,
  listQualityCohort,
} from "@/modules/reports/quality.repository";
import type {
  ComparableSummary,
  GetQcRejectsQuery,
  GetReportRangeQuery,
} from "@/modules/reports/report.schema";
import {
  buildContext,
  buildDeltas,
  dailyBuckets,
} from "@/modules/reports/report-range.service";
import { getJakartaRange, rate } from "@/modules/reports/report-range.util";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";

interface QualitySummary {
  complaint_rate: number;
  complaints: number;
  first_pass: number;
  first_pass_rate: number;
  passes: number;
  qc_rejects: number;
  self_check_rate: number;
  self_checks: number;
  sent_back: number;
  services_processed: number;
}

type CohortLine = Awaited<ReturnType<typeof listQualityCohort>>[number];
type ComplaintOutcome = "reworked" | "refunded" | "cancelled" | "pending";

async function qualityFor(args: RangeArgs) {
  const [cohort, checkers] = await Promise.all([
    listQualityCohort(args),
    listQualityChecksByChecker(args),
  ]);
  return { cohort, checkers };
}

function summariseQuality({
  cohort,
  checkers,
}: Awaited<ReturnType<typeof qualityFor>>): QualitySummary {
  const processed = cohort.length;
  const sentBack = cohort.filter((line) => line.sent_back).length;
  const complaints = cohort.filter((line) => line.complaint_id !== null).length;
  const checks = checkers.reduce((sum, row) => sum + row.checks, 0);
  const passes = checkers.reduce((sum, row) => sum + row.passes, 0);
  const selfChecks = checkers.reduce((sum, row) => sum + row.self_checks, 0);
  // A pair only reaches qc_reject from a check, so every reject is a failed check.
  const qcRejects = checks - passes;
  return {
    services_processed: processed,
    first_pass: processed - sentBack,
    sent_back: sentBack,
    first_pass_rate: rate(processed - sentBack, processed),
    complaints,
    complaint_rate: rate(complaints, processed),
    qc_rejects: qcRejects,
    passes,
    self_checks: selfChecks,
    self_check_rate: rate(selfChecks, passes),
  };
}

function countComplaintOutcomes(cohort: CohortLine[]) {
  const outcomes: Record<ComplaintOutcome, number> = {
    reworked: 0,
    refunded: 0,
    cancelled: 0,
    pending: 0,
  };
  // Same reading as the Complaints page badge, so the two never disagree.
  for (const line of cohort) {
    if (line.complaint_id === null) {
      continue;
    }
    if (line.status === "refunded" || line.status === "cancelled") {
      outcomes[line.status] += 1;
    } else {
      outcomes[line.has_live_rework ? "reworked" : "pending"] += 1;
    }
  }
  return outcomes;
}

function groupByService(cohort: CohortLine[]) {
  const byService = new Map<
    number,
    {
      service_id: number;
      service_name: string;
      processed: number;
      first_pass: number;
      first_pass_rate: number;
      sent_back: number;
      complaints: number;
    }
  >();
  for (const line of cohort) {
    const serviceId = line.service_id ?? 0;
    const entry = byService.get(serviceId) ?? {
      service_id: serviceId,
      service_name: line.service_name ?? "Unknown",
      processed: 0,
      first_pass: 0,
      first_pass_rate: 0,
      sent_back: 0,
      complaints: 0,
    };
    entry.processed += 1;
    entry.sent_back += line.sent_back ? 1 : 0;
    entry.complaints += line.complaint_id === null ? 0 : 1;
    entry.first_pass = entry.processed - entry.sent_back;
    entry.first_pass_rate = rate(entry.first_pass, entry.processed);
    byService.set(serviceId, entry);
  }
  return Array.from(byService.values()).sort(
    (a, b) =>
      a.first_pass_rate - b.first_pass_rate ||
      b.processed - a.processed ||
      a.service_name.localeCompare(b.service_name)
  );
}

interface CheckCount {
  passes: number;
  rejects: number;
}

type CheckerDay = Awaited<
  ReturnType<typeof listQualityChecksByCheckerDay>
>[number];

// Arrivals on the QC shelf beside the checks made, so a growing pile shows.
function buildDaily(
  from: string,
  to: string,
  arrivals: Awaited<ReturnType<typeof listQcArrivalsByDay>>,
  checkerDays: CheckerDay[]
) {
  const { bucket, bucketOf, labels } = dailyBuckets(from, to);
  const arrived = new Map<string, number>();
  for (const row of arrivals) {
    const label = bucketOf(row.day);
    arrived.set(label, (arrived.get(label) ?? 0) + row.arrived);
  }
  const checks = new Map<string, CheckCount>();
  const byChecker = new Map<number, Map<string, CheckCount>>();
  for (const row of checkerDays) {
    const label = bucketOf(row.day);
    const total = checks.get(label) ?? { passes: 0, rejects: 0 };
    total.passes += row.passes;
    total.rejects += row.rejects;
    checks.set(label, total);
    const days = byChecker.get(row.user_id) ?? new Map<string, CheckCount>();
    const own = days.get(label) ?? { passes: 0, rejects: 0 };
    own.passes += row.passes;
    own.rejects += row.rejects;
    days.set(label, own);
    byChecker.set(row.user_id, days);
  }
  return {
    bucket,
    rows: labels.map((label) => ({
      label,
      arrived: arrived.get(label) ?? 0,
      passes: checks.get(label)?.passes ?? 0,
      qc_rejects: checks.get(label)?.rejects ?? 0,
    })),
    checkerDays: (userId: number) =>
      labels.map((label) => ({
        label,
        passes: byChecker.get(userId)?.get(label)?.passes ?? 0,
        qc_rejects: byChecker.get(userId)?.get(label)?.rejects ?? 0,
      })),
  };
}

export async function getQualityReport(query: GetReportRangeQuery) {
  const ctx = buildContext(query);
  const range = getJakartaRange(ctx.from, ctx.to);
  const storeId = ctx.store_id ?? undefined;

  const [current, previous, damagedLost, arrivals, checkerDays, waitingQc] =
    await Promise.all([
      qualityFor({ range, storeId }),
      qualityFor({ range: ctx.previous.range, storeId }),
      listDamagedLostRefunds({ range, storeId }),
      listQcArrivalsByDay({ range, storeId }),
      listQualityChecksByCheckerDay({ range, storeId }),
      findWaitingQcNow(storeId),
    ]);

  const summary = summariseQuality(current);
  const prevSummary = summariseQuality(previous);
  const daily = buildDaily(ctx.from, ctx.to, arrivals, checkerDays);
  // Services, like the "out of" figure: one sent back twice is one mistake.
  const mistakeRejects = current.cohort.filter(
    (line) => line.sent_back && line.complaint_id === null
  ).length;

  return {
    from: ctx.from,
    to: ctx.to,
    store_id: ctx.store_id,
    previous: { from: ctx.previous.from, to: ctx.previous.to },
    summary: {
      current: summary,
      previous: prevSummary,
      deltas: buildDeltas(summary, prevSummary),
    } satisfies ComparableSummary<QualitySummary>,
    complaint_outcomes: countComplaintOutcomes(current.cohort),
    mistakes: {
      total: mistakeRejects + summary.complaints,
      qc_rejects: mistakeRejects,
      complaints: summary.complaints,
    },
    waiting_qc_now: waitingQc,
    daily: { bucket: daily.bucket, rows: daily.rows },
    by_service: groupByService(current.cohort),
    by_checker: current.checkers.map((row) => ({
      user_id: row.user_id,
      user_name: row.user_name,
      checks: row.checks,
      days_checked: row.days_checked,
      per_day: Number((row.checks / row.days_checked).toFixed(1)),
      passes: row.passes,
      rejects: row.checks - row.passes,
      reject_rate: rate(row.checks - row.passes, row.checks),
      self_checks: row.self_checks,
      self_check_rate: rate(row.self_checks, row.passes),
      complaints_after: row.complaints_after,
      days: daily.checkerDays(row.user_id),
    })),
    damaged_lost: damagedLost,
  };
}

export async function getQcRejectsReport(query: GetQcRejectsQuery) {
  const pagination = normalizePagination(query, {
    defaultPageSize: 50,
    maxPageSize: 200,
  });
  const args = {
    range: getJakartaRange(query.from, query.to),
    storeId: query.store_id,
    checkerId: query.checker_id,
  };

  const [items, total] = await Promise.all([
    listQcRejects({ ...args, ...pagination }),
    countQcRejects(args),
  ]);

  return {
    items,
    meta: buildPaginationMeta(total, pagination),
  };
}
