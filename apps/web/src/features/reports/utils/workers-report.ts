import type {
  WorkerDetailReport,
  WorkerLiveRow,
  WorkerProductivityReport,
  WorkerRangeRow,
  WorkerRow,
} from "@/features/reports/api";
import { escapeCsv } from "@/features/reports/utils/csv";
import {
  fixedPercentFormatter,
  numberFormatter,
  pluralCount,
} from "@/features/reports/utils/format";
import dayjs, { formatShiftLength } from "@/lib/dayjs";

type MatrixCell = WorkerProductivityReport["services_matrix"]["cells"][number];
type DetailBucket = WorkerDetailReport["buckets"][number];
type DetailService = WorkerDetailReport["services"][number];
type Live = WorkerRow["live"];

// The owner will set these lines in Settings (GitHub issue #159); until then a
// QC reject or Complaint chip is coloured from this one block.
export const WORKER_TONES = {
  // Under this many checks one reject swings the rate by 5 points or more.
  minChecksForQcRate: 20,
  qcGoodBelow: 0.08,
  qcBadFrom: 0.12,
  complaintBadFrom: 0.02,
} as const;

export type Tone = "neutral" | "good" | "warn" | "bad";

export const qcTone = (rejects: number, checks: number): Tone => {
  if (checks < WORKER_TONES.minChecksForQcRate) {
    return "neutral";
  }
  const rate = rejects / checks;
  if (rate < WORKER_TONES.qcGoodBelow) {
    return "good";
  }
  return rate < WORKER_TONES.qcBadFrom ? "warn" : "bad";
};

export const complaintTone = (complaints: number, finished: number): Tone => {
  if (complaints === 0) {
    return "neutral";
  }
  return complaints / finished >= WORKER_TONES.complaintBadFrom
    ? "bad"
    : "warn";
};

export const outOf = (part: number, whole: number) =>
  `${numberFormatter.format(part)}/${numberFormatter.format(whole)}`;

// The rate shows only once there are enough checks for it to mean something.
export const qcText = (rejects: number, checks: number) =>
  checks >= WORKER_TONES.minChecksForQcRate
    ? `${numberFormatter.format(rejects)} · ${fixedPercentFormatter.format(rejects / checks)}`
    : numberFormatter.format(rejects);

export interface WorkerTotals {
  people: number;
  services: number;
  perDayWorked: number | null;
  qcRejects: number;
  qcChecks: number;
  complaints: number;
  complaintCohort: number;
}

// A row there only for what someone is doing today has nothing in the range.
const hasRangeWork = (row: WorkerRangeRow) =>
  row.days_worked > 0 || row.services_processed > 0 || row.qc_checks > 0;

// Only Services started by someone with a day worked count towards the rate.
export const totalsOf = (rows: WorkerRangeRow[]): WorkerTotals => {
  const totals: WorkerTotals = {
    people: rows.filter(hasRangeWork).length,
    services: 0,
    perDayWorked: null,
    qcRejects: 0,
    qcChecks: 0,
    complaints: 0,
    complaintCohort: 0,
  };
  let staffedServices = 0;
  let daysWorked = 0;
  for (const row of rows) {
    totals.services += row.services_processed;
    totals.qcRejects += row.qc_rejects;
    totals.qcChecks += row.qc_checks;
    totals.complaints += row.complaints;
    totals.complaintCohort += row.complaint_cohort;
    if (row.days_worked > 0) {
      staffedServices += row.services_processed;
      daysWorked += row.days_worked;
    }
  }
  totals.perDayWorked = daysWorked > 0 ? staffedServices / daysWorked : null;
  return totals;
};

interface StoreGroup<T> {
  store_id: number;
  store_name: string;
  rows: T[];
  totals: WorkerTotals;
}

// Busiest Store first, so the owner opens the one that matters most.
export const groupByStore = <T extends WorkerRangeRow>(
  rows: T[]
): StoreGroup<T>[] => {
  const byStore = new Map<number, T[]>();
  for (const row of rows) {
    byStore.set(row.store_id, [...(byStore.get(row.store_id) ?? []), row]);
  }
  return [...byStore.values()]
    .map((storeRows) => ({
      store_id: storeRows[0].store_id,
      store_name: storeRows[0].store_name,
      rows: storeRows,
      totals: totalsOf(storeRows),
    }))
    .toSorted((a, b) => b.totals.services - a.totals.services);
};

export const workerKey = (userId: number, storeId: number) =>
  `${userId}:${storeId}`;

const OFF_THE_FLOOR: Live = {
  clock_in_at: null,
  clock_out_at: null,
  in_hand: 0,
  last_move_at: null,
  services_today: 0,
};

const NOTHING_IN_RANGE = {
  clocked_in: false,
  services_processed: 0,
  days_worked: 0,
  days: [],
  per_day_worked: null,
  qc_checks: 0,
  qc_rejects: 0,
  complaints: 0,
  complaint_cohort: 0,
};

// The owner looking at last week still sees who is on the floor now, so
// someone busy today with nothing in the range gets a row of their own.
export const withLive = (
  rangeRows: WorkerRangeRow[],
  liveRows: WorkerLiveRow[] = []
): WorkerRow[] => {
  const liveByKey = new Map(
    liveRows.map((row) => [workerKey(row.user_id, row.store_id), row])
  );
  const rows: WorkerRow[] = rangeRows.map((row) => {
    const key = workerKey(row.user_id, row.store_id);
    const live = liveByKey.get(key)?.live ?? OFF_THE_FLOOR;
    liveByKey.delete(key);
    return { ...row, live };
  });
  for (const row of liveByKey.values()) {
    rows.push({ ...row, ...NOTHING_IN_RANGE });
  }
  return rows.toSorted(
    (a, b) =>
      a.store_name.localeCompare(b.store_name) ||
      b.services_processed - a.services_processed ||
      a.user_name.localeCompare(b.user_name)
  );
};

export type WorkersView = "worker" | "store";

interface StorePart {
  store_id: number;
  services: number;
}

export interface PersonRow extends Omit<
  WorkerRow,
  "store_id" | "store_name" | "days" | "clocked_in"
> {
  // Services by the Order's Store, biggest first.
  stores: StorePart[];
  row_store_ids: number[];
  clock_in_store_ids: number[];
}

const laterOf = (a: string | null, b: string | null) => {
  if (a === null || b === null) {
    return a ?? b;
  }
  return dayjs(a).isAfter(dayjs(b)) ? a : b;
};

// The open Shift wins, else the latest clock-in.
const shiftOf = (a: Live, b: Live) => {
  if (b.clock_in_at === null) {
    return a;
  }
  if (a.clock_in_at === null) {
    return b;
  }
  const aOpen = a.clock_out_at === null;
  const bOpen = b.clock_out_at === null;
  if (aOpen !== bOpen) {
    return aOpen ? a : b;
  }
  return dayjs(b.clock_in_at).isAfter(dayjs(a.clock_in_at)) ? b : a;
};

const mergeLive = (a: Live, b: Live): Live => {
  const shift = shiftOf(a, b);
  return {
    clock_in_at: shift.clock_in_at,
    clock_out_at: shift.clock_out_at,
    in_hand: a.in_hand + b.in_hand,
    last_move_at: laterOf(a.last_move_at, b.last_move_at),
    services_today: a.services_today + b.services_today,
  };
};

const byServicesThenName = (a: PersonRow, b: PersonRow) =>
  b.services_processed - a.services_processed ||
  a.user_name.localeCompare(b.user_name);

// One row per person across every Store: a day at two Stores is one day worked,
// and the pace divides all their Services, so a BSD Item another worker
// finished on a day they spent only at GRH still counts toward it.
export const mergeByPerson = (rows: WorkerRow[]): PersonRow[] => {
  const byUser = new Map<number, WorkerRow[]>();
  for (const row of rows) {
    const own = byUser.get(row.user_id);
    if (own) {
      own.push(row);
    } else {
      byUser.set(row.user_id, [row]);
    }
  }
  return [...byUser.values()]
    .map((own) => {
      const [first] = own;
      const days = new Set(own.flatMap((row) => row.days));
      const totals = totalsOf(own);
      let { live } = first;
      for (const row of own.slice(1)) {
        live = mergeLive(live, row.live);
      }
      return {
        user_id: first.user_id,
        user_name: first.user_name,
        avatar_url: first.avatar_url,
        role: first.role,
        services_processed: totals.services,
        days_worked: days.size,
        per_day_worked: days.size > 0 ? totals.services / days.size : null,
        qc_checks: totals.qcChecks,
        qc_rejects: totals.qcRejects,
        complaints: totals.complaints,
        complaint_cohort: totals.complaintCohort,
        live,
        stores: own
          .filter((row) => row.services_processed > 0)
          .map((row) => ({
            store_id: row.store_id,
            services: row.services_processed,
          }))
          .toSorted((a, b) => b.services - a.services),
        row_store_ids: own.map((row) => row.store_id),
        clock_in_store_ids: own
          .filter((row) => row.clocked_in)
          .map((row) => row.store_id),
      };
    })
    .toSorted(byServicesThenName);
};

// A Store's people in By Worker are those who clocked in there, plus those who
// never clocked in anywhere but cleaned its Items; each shows their whole range.
export const workedAt = (rows: WorkerRow[], storeId: number | undefined) => {
  const people = mergeByPerson(rows);
  if (storeId === undefined) {
    return people;
  }
  const benchAt = new Set(
    rows
      .filter(
        (row) =>
          row.store_id === storeId &&
          (row.services_processed > 0 || row.qc_checks > 0)
      )
      .map((row) => row.user_id)
  );
  return people.filter((person) =>
    person.clock_in_store_ids.length > 0
      ? person.clock_in_store_ids.includes(storeId)
      : benchAt.has(person.user_id)
  );
};

// A booth with no bench of its own: who cleans its Items, biggest first.
export const cleanedBy = (rows: WorkerRow[], storeId: number) =>
  rows
    .filter((row) => row.store_id === storeId && row.services_processed > 0)
    .toSorted((a, b) => b.services_processed - a.services_processed)
    .map((row) => row.user_name);

// How long since a last move: "5m", "1h", "5h 55m", "9d 3h".
export const durationText = (minutes: number) => {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  if (minutes >= 24 * 60) {
    const hoursLeft = Math.floor((minutes % (24 * 60)) / 60);
    const days = `${Math.floor(minutes / (24 * 60))}d`;
    return hoursLeft === 0 ? days : `${days} ${hoursLeft}h`;
  }
  const rest = minutes % 60;
  const hours = `${Math.floor(minutes / 60)}h`;
  return rest === 0 ? hours : `${hours} ${rest}m`;
};

const minutesSince = (value: string, now: number) =>
  Math.max(0, dayjs(now).diff(dayjs(value), "minute"));

export const sinceText = (value: string | null, now: number) =>
  value ? durationText(minutesSince(value, now)) : "—";

// The server sends the open Shift, or else the last one clocked in today.
export const openShiftSince = (live: Live) =>
  live.clock_out_at === null ? live.clock_in_at : null;

// Moved Items or finished Services today with no Shift today at all.
export const isMissingClockIn = (live: Live) =>
  live.clock_in_at === null &&
  (live.services_today > 0 || live.last_move_at !== null);

// The owner will set these in Settings (GitHub issue #159), like WORKER_TONES.
export const NEEDS_A_LOOK = {
  // On shift this long with nothing reaching QC today.
  idleShiftMinutes: 120,
  // More Items in hand than one person can be working on.
  maxInHand: 20,
} as const;

export interface Flag {
  key: string;
  row: WorkerRow;
  // Plain text either side of the part shown in red.
  before: string;
  problem: string;
  after: string;
}

export const needsALook = (rows: WorkerRow[], now: number): Flag[] =>
  rows.flatMap((row) => {
    const { live } = row;
    const key = workerKey(row.user_id, row.store_id);
    const inHand = `${numberFormatter.format(live.in_hand)} in hand`;
    const openSince = openShiftSince(live);
    const shiftMinutes = openSince ? minutesSince(openSince, now) : 0;
    const flags: Flag[] = [];
    if (isMissingClockIn(live)) {
      flags.push({
        key: `${key}:clock-in`,
        row,
        before: `${pluralCount(live.services_today, "Service")} today, ${inHand} — `,
        problem: "not clocked in",
        after: "",
      });
    }
    // A person doing QC checks all morning finishes no Services but still moves Items.
    if (
      live.services_today === 0 &&
      shiftMinutes > NEEDS_A_LOOK.idleShiftMinutes &&
      (live.last_move_at === null ||
        minutesSince(live.last_move_at, now) > NEEDS_A_LOOK.idleShiftMinutes)
    ) {
      flags.push({
        key: `${key}:idle`,
        row,
        before: `on shift ${formatShiftLength(shiftMinutes)}, `,
        problem: `${pluralCount(0, "Service")} today`,
        after: "",
      });
    }
    if (live.in_hand > NEEDS_A_LOOK.maxInHand) {
      flags.push({
        key: `${key}:in-hand`,
        row,
        before: "",
        problem: inHand,
        after: `, ${numberFormatter.format(live.services_today)} reached QC today`,
      });
    }
    return flags;
  });

const cellKey = (userId: number, storeId: number, serviceId: number) =>
  `${workerKey(userId, storeId)}:${serviceId}`;

export const buildCountIndex = (cells: MatrixCell[]) => {
  const counts = new Map<string, number>();
  const rowTotals = new Map<string, number>();
  for (const cell of cells) {
    counts.set(
      cellKey(cell.user_id, cell.store_id, cell.service_id),
      cell.count
    );
    const key = workerKey(cell.user_id, cell.store_id);
    rowTotals.set(key, (rowTotals.get(key) ?? 0) + cell.count);
  }
  return {
    count: (userId: number, storeId: number, serviceId: number) =>
      counts.get(cellKey(userId, storeId, serviceId)) ?? 0,
    rowTotal: (userId: number, storeId: number) =>
      rowTotals.get(workerKey(userId, storeId)) ?? 0,
  };
};

export const avgPerDay = (count: number, daysWorked: number) =>
  daysWorked > 0 ? Number((count / daysWorked).toFixed(1)) : null;

export const TOP_SERVICES_IN_CHART = 4;

// The biggest few Services get a colour; the rest share one grey slice.
export const splitTopServices = (
  services: DetailService[],
  limit = TOP_SERVICES_IN_CHART
) => {
  const sorted = services.toSorted(
    (a, b) => b.count - a.count || a.service_name.localeCompare(b.service_name)
  );
  return { top: sorted.slice(0, limit), rest: sorted.slice(limit) };
};

interface ChartRow {
  label: string;
  total: number;
  storeAverage: number | null;
  // Count per top Service by position, then the grey rest.
  slices: number[];
  other: number;
  rest: DetailBucket["services"];
}

// Days the worker was off leave the chart.
export const buildChartRows = (
  buckets: DetailBucket[],
  topIds: number[]
): ChartRow[] =>
  buckets.flatMap((bucket) => {
    if (bucket.total === null) {
      return [];
    }
    const counts = new Map(bucket.services.map((s) => [s.service_id, s.count]));
    const slices = topIds.map((id) => counts.get(id) ?? 0);
    return {
      label: bucket.label,
      total: bucket.total,
      storeAverage: bucket.store_average,
      slices,
      other: bucket.total - slices.reduce((sum, n) => sum + n, 0),
      rest: bucket.services.filter((s) => !topIds.includes(s.service_id)),
    };
  });

interface ByWorkerCsv {
  people: PersonRow[];
  storeCodes: Map<number, string>;
}

const storeRowLines = (workers: WorkerRangeRow[]) => [
  "Workers,Store,Worker,Role,Days worked,Services,Per day worked,QC rejects,QC checks,Complaints,Complaint cohort",
  ...workers.map((w) =>
    [
      "Workers",
      escapeCsv(w.store_name),
      escapeCsv(w.user_name),
      w.role,
      w.days_worked,
      w.services_processed,
      escapeCsv(w.per_day_worked),
      w.qc_rejects,
      w.qc_checks,
      w.complaints,
      w.complaint_cohort,
    ].join(",")
  ),
];

const personRowLines = ({ people, storeCodes }: ByWorkerCsv) => [
  "Workers,Worker,Role,Days worked,Services,Per day worked,QC rejects,QC checks,Complaints,Complaint cohort,Services by Store",
  ...people.map((p) =>
    [
      "Workers",
      escapeCsv(p.user_name),
      p.role,
      p.days_worked,
      p.services_processed,
      escapeCsv(
        p.per_day_worked === null ? null : Number(p.per_day_worked.toFixed(2))
      ),
      p.qc_rejects,
      p.qc_checks,
      p.complaints,
      p.complaint_cohort,
      escapeCsv(
        p.stores
          .map(
            (part) => `${storeCodes.get(part.store_id) ?? "?"} ${part.services}`
          )
          .join(" · ")
      ),
    ].join(",")
  ),
];

// By Worker exports the people on screen; Services by Worker stays per Store.
export const buildWorkersCsv = (
  data: WorkerProductivityReport,
  byWorker?: ByWorkerCsv
) => {
  const lines = byWorker
    ? personRowLines(byWorker)
    : storeRowLines(data.workers);

  const { count } = buildCountIndex(data.services_matrix.cells);
  lines.push("", "Services by worker,Store,Worker,Service,Count,Avg/day");
  for (const w of data.workers) {
    for (const service of data.services_matrix.services) {
      const n = count(w.user_id, w.store_id, service.service_id);
      if (n > 0) {
        lines.push(
          `Services by worker,${escapeCsv(w.store_name)},${escapeCsv(w.user_name)},${escapeCsv(service.service_name)},${n},${escapeCsv(avgPerDay(n, w.days_worked))}`
        );
      }
    }
  }
  return lines.join("\n");
};
