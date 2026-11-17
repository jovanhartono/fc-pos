import type { QualityReport } from "@/features/reports/api";
import {
  numberFormatter,
  paceText,
  pluralCount,
} from "@/features/reports/utils/format";
import { avgPerDay } from "@/features/reports/utils/workers-report";

type CheckerRow = QualityReport["by_checker"][number];

export type CheckerCounts = Pick<
  CheckerRow,
  | "checks"
  | "days_checked"
  | "passes"
  | "rejects"
  | "self_checks"
  | "complaints_after"
>;

export const teamOf = (rows: readonly CheckerRow[]): CheckerCounts =>
  rows.reduce(
    (team, row) => ({
      checks: team.checks + row.checks,
      days_checked: team.days_checked + row.days_checked,
      passes: team.passes + row.passes,
      rejects: team.rejects + row.rejects,
      self_checks: team.self_checks + row.self_checks,
      complaints_after: team.complaints_after + row.complaints_after,
    }),
    {
      checks: 0,
      days_checked: 0,
      passes: 0,
      rejects: 0,
      self_checks: 0,
      complaints_after: 0,
    }
  );

// One checker's average day, so a slow checker reads against it.
export const teamPace = (team: CheckerCounts) =>
  avgPerDay(team.checks, team.days_checked);

// Self-passed and Complaints are out of passes: only a pass can be your own
// work or come back from a customer. `flag` names an outlier, from `minCount`
// up so one slip on a quiet week doesn't read as a habit.
export const QUALITY_RATES = [
  {
    id: "pass_rate",
    label: "Pass rate",
    teamWord: "passed",
    help: "Checks passed. The line under it counts the rest, sent back to the worker.",
    part: (c: CheckerCounts) => c.passes,
    whole: (c: CheckerCounts) => c.checks,
    detail: (c: CheckerCounts) =>
      `${numberFormatter.format(c.rejects)} rejected`,
    hasZeroDetail: (c: CheckerCounts) => c.rejects === 0,
    // A checker who rejects a lot may just be strict.
    flag: null,
    minCount: 0,
  },
  {
    id: "self_passed",
    label: "Self-passed",
    teamWord: "Self-passed",
    help: "Passes on Services the checker cleaned themselves.",
    part: (c: CheckerCounts) => c.self_checks,
    whole: (c: CheckerCounts) => c.passes,
    detail: (c: CheckerCounts) => pluralCount(c.self_checks, "own Service"),
    hasZeroDetail: (c: CheckerCounts) => c.self_checks === 0,
    flag: "self-passes a lot",
    minCount: 3,
  },
  {
    id: "complaints_after",
    label: "Complaints",
    teamWord: "Complaints",
    help: "Passes that came back as a Complaint.",
    part: (c: CheckerCounts) => c.complaints_after,
    whole: (c: CheckerCounts) => c.passes,
    detail: (c: CheckerCounts) => pluralCount(c.complaints_after, "Complaint"),
    hasZeroDetail: (c: CheckerCounts) => c.complaints_after === 0,
    flag: "many Complaints",
    minCount: 2,
  },
] as const;

export type QualityRate = (typeof QUALITY_RATES)[number];

export const rateOf = (rate: QualityRate, counts: CheckerCounts) => {
  const whole = rate.whole(counts);
  return whole === 0 ? null : rate.part(counts) / whole;
};

// Twice the team's rate, or under half its pace, is worth the owner's look.
const OUTLIER_FACTOR = 2;
const MIN_PACE_DAYS = 3;

export const outlierFlags = (row: CheckerRow, team: CheckerCounts) => {
  const flags: string[] = [];
  const pace = teamPace(team);
  if (
    pace !== null &&
    row.days_checked >= MIN_PACE_DAYS &&
    row.per_day < pace / OUTLIER_FACTOR
  ) {
    flags.push(`slow · team ${paceText(pace)}`);
  }
  for (const rate of QUALITY_RATES) {
    const value = rateOf(rate, row);
    const teamValue = rateOf(rate, team);
    if (
      rate.flag &&
      value !== null &&
      teamValue !== null &&
      rate.part(row) >= rate.minCount &&
      value >= teamValue * OUTLIER_FACTOR
    ) {
      flags.push(rate.flag);
    }
  }
  return flags;
};
