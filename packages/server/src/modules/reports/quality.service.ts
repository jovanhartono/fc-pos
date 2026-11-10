import type { RangeArgs } from "@/modules/reports/money-basis";
import {
  type ComplaintOutcome,
  complaintOutcome,
  countQcRejects,
  countQcRejectsByService,
  findWaitingQcNow,
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
  checks: number;
  complaint_rate: number;
  complaints: number;
  first_pass: number;
  first_pass_rate: number;
  passes: number;
  qc_rejects: number;
  self_check_rate: number;
  self_checks: number;
  services_processed: number;
}

type CohortLine = Awaited<ReturnType<typeof listQualityCohort>>[number];

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
    first_pass_rate: rate(processed - sentBack, processed),
    complaints,
    complaint_rate: rate(complaints, processed),
    checks,
    qc_rejects: qcRejects,
    passes,
    self_checks: selfChecks,
    self_check_rate: rate(selfChecks, passes),
  };
}

// The Complaints the Mistakes count is made of, newest first.
const listComplaints = (cohort: CohortLine[]) =>
  cohort
    .flatMap((line) =>
      line.complaint_id === null || line.complained_at === null
        ? []
        : [
            {
              complaint_id: line.complaint_id,
              complained_at: line.complained_at,
              item_code: line.item_code,
              item_brand: line.item_brand,
              item_model: line.item_model,
              item_color: line.item_color,
              item_size: line.item_size,
              service_name: line.service_name,
              reason: line.complaint_reason,
              outcome: complaintOutcome(line),
            },
          ]
    )
    .sort((a, b) => b.complained_at.getTime() - a.complained_at.getTime());

function countComplaintOutcomes(complaints: ReturnType<typeof listComplaints>) {
  const outcomes: Record<ComplaintOutcome, number> = {
    reworked: 0,
    refunded: 0,
    cancelled: 0,
    pending: 0,
  };
  for (const complaint of complaints) {
    outcomes[complaint.outcome] += 1;
  }
  return outcomes;
}

const blankService = (serviceId: number, serviceName: string | null) => ({
  service_id: serviceId,
  service_name: serviceName ?? "Unknown",
  processed: 0,
  first_pass: 0,
  first_pass_rate: 0,
  qc_rejects: 0,
  complaints: 0,
});

// QC rejects are every reject made in the range, like everywhere else on the
// report, so a Service only rejected this week still gets a row.
function groupByService(
  cohort: CohortLine[],
  rejects: Awaited<ReturnType<typeof countQcRejectsByService>>
) {
  const byService = new Map<number, ReturnType<typeof blankService>>();
  for (const row of rejects) {
    const serviceId = row.service_id ?? 0;
    const entry = blankService(serviceId, row.service_name);
    entry.qc_rejects = row.rejects;
    byService.set(serviceId, entry);
  }
  for (const line of cohort) {
    const serviceId = line.service_id ?? 0;
    const entry =
      byService.get(serviceId) ?? blankService(serviceId, line.service_name);
    entry.processed += 1;
    entry.first_pass += line.sent_back ? 0 : 1;
    entry.complaints += line.complaint_id === null ? 0 : 1;
    entry.first_pass_rate = rate(entry.first_pass, entry.processed);
    byService.set(serviceId, entry);
  }
  return Array.from(byService.values()).sort(
    (a, b) =>
      Number(a.processed === 0) - Number(b.processed === 0) ||
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

  const [
    current,
    previous,
    arrivals,
    checkerDays,
    waitingQc,
    rejectsByService,
  ] = await Promise.all([
    qualityFor({ range, storeId }),
    qualityFor({ range: ctx.previous.range, storeId }),
    listQcArrivalsByDay({ range, storeId }),
    listQualityChecksByCheckerDay({ range, storeId }),
    findWaitingQcNow(storeId),
    countQcRejectsByService({ range, storeId }),
  ]);

  const summary = summariseQuality(current);
  const prevSummary = summariseQuality(previous);
  const daily = buildDaily(ctx.from, ctx.to, arrivals, checkerDays);
  const complaints = listComplaints(current.cohort);

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
    complaint_outcomes: countComplaintOutcomes(complaints),
    complaints,
    mistakes: {
      total: summary.qc_rejects + summary.complaints,
      qc_rejects: summary.qc_rejects,
      complaints: summary.complaints,
    },
    waiting_qc_now: waitingQc,
    daily: { bucket: daily.bucket, rows: daily.rows },
    by_service: groupByService(current.cohort, rejectsByService),
    by_checker: current.checkers.map((row) => ({
      user_id: row.user_id,
      user_name: row.user_name,
      checks: row.checks,
      days_checked: row.days_checked,
      per_day: Number((row.checks / row.days_checked).toFixed(1)),
      passes: row.passes,
      rejects: row.checks - row.passes,
      self_checks: row.self_checks,
      complaints_after: row.complaints_after,
      days: daily.checkerDays(row.user_id),
    })),
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
