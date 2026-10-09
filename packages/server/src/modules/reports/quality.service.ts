import type { RangeArgs } from "@/modules/reports/money-basis";
import {
  countQcRejects,
  listDamagedLostRefunds,
  listQcRejects,
  listQualityChecksByChecker,
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
} from "@/modules/reports/report-range.service";
import { getJakartaRange } from "@/modules/reports/report-range.util";
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

const rate = (part: number, whole: number) =>
  whole > 0 ? Number((part / whole).toFixed(4)) : 0;

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

export async function getQualityReport(query: GetReportRangeQuery) {
  const ctx = buildContext(query);
  const range = getJakartaRange(ctx.from, ctx.to);
  const storeId = ctx.store_id ?? undefined;

  const [current, previous, damagedLost] = await Promise.all([
    qualityFor({ range, storeId }),
    qualityFor({ range: ctx.previous.range, storeId }),
    listDamagedLostRefunds({ range, storeId }),
  ]);

  const summary = summariseQuality(current);
  const prevSummary = summariseQuality(previous);

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
    by_service: groupByService(current.cohort),
    by_checker: current.checkers.map((row) => ({
      user_id: row.user_id,
      user_name: row.user_name,
      checks: row.checks,
      passes: row.passes,
      rejects: row.checks - row.passes,
      reject_rate: rate(row.checks - row.passes, row.checks),
      self_checks: row.self_checks,
      self_check_rate: rate(row.self_checks, row.passes),
      complaints_after: row.complaints_after,
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
