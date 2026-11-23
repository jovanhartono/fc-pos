import { ArrowRight01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PersonRow, WorkerRow } from "@/features/reports/api";
import { Pace, PersonName } from "@/features/reports/components/person-cells";
import { StoreGroup } from "@/features/reports/components/store-group";
import { BadCount } from "@/features/reports/components/tone-chip";
import { useStoreCodes } from "@/features/reports/hooks/use-store-codes";
import {
  numberFormatter,
  paceText,
  pluralCount,
} from "@/features/reports/utils/format";
import {
  groupByStore,
  isMissingClockIn,
  openShiftSince,
  sinceText,
} from "@/features/reports/utils/workers-report";
import { storesQueries } from "@/features/stores/api";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useMountValue } from "@/hooks/use-mount-value";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";

type Live = WorkerRow["live"];
type TableRow = WorkerRow | PersonRow;
type StoreCodes = Map<number, string>;

const n = (value: number) => numberFormatter.format(value);

// A Shift left open from an earlier day shows its day, so a worker who never
// clocked out doesn't read as someone who started this morning.
const formatClock = (value: string) => {
  const at = dayjs(value).tz(JAKARTA_TZ);
  return at.isSame(dayjs().tz(JAKARTA_TZ), "day")
    ? at.format("HH:mm")
    : at.format("D MMM HH:mm");
};

interface WorkerNameProps {
  name: string;
  role: string;
}

export const WorkerName = ({ name, role }: WorkerNameProps) => (
  <>
    {name}
    {role !== "worker" && (
      <span className="ml-1.5 text-subhead font-normal text-muted-foreground">
        {role}
      </span>
    )}
  </>
);

interface ShiftStatusProps {
  live: Live;
}

const ShiftStatus = ({ live }: ShiftStatusProps) => {
  const since = openShiftSince(live);
  if (since) {
    // `relative` lifts the label above the row's click area so its title shows.
    return (
      <span
        title={`Clocked in ${formatClock(since)}`}
        className="relative inline-flex items-center gap-1.5 text-tone-good-foreground"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
        On shift
      </span>
    );
  }
  // Moving Items today with no Shift means they forgot to clock in.
  if (isMissingClockIn(live)) {
    return <span className="text-tone-bad-foreground">No clock-in</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-muted-foreground/40"
      />
      Off
    </span>
  );
};

interface LiveLineProps {
  live: Live;
  now: number;
}

// What the person is doing today, under their name whatever range is chosen.
const LiveLine = ({ live, now }: LiveLineProps) => {
  const isAtWork = openShiftSince(live) !== null || isMissingClockIn(live);
  const facts = [
    isAtWork || live.in_hand > 0 ? `${n(live.in_hand)} in hand` : null,
    live.last_move_at ? `moved ${sinceText(live.last_move_at, now)} ago` : null,
  ].filter(Boolean);
  return (
    <span className="text-subhead text-muted-foreground tabular-nums">
      <ShiftStatus live={live} />
      {facts.map((fact) => ` · ${fact}`).join("")}
    </span>
  );
};

const storeSplit = (person: PersonRow | undefined, storeCodes: StoreCodes) =>
  person && person.stores.length > 1
    ? person.stores
        .map(
          (part) =>
            `${storeCodes.get(part.store_id) ?? "?"} ${n(part.services)}`
        )
        .join(" · ")
    : undefined;

interface RowNameProps {
  row: TableRow;
  now: number;
  storeCodes: StoreCodes;
}

// In By Worker the chips name the Stores the person clocked in at, and a
// line of its own splits their Services by the Order's Store.
const RowName = ({ row, now, storeCodes }: RowNameProps) => {
  const person = "stores" in row ? row : undefined;
  const split = storeSplit(person, storeCodes);
  return (
    <PersonName
      avatarUrl={row.avatar_url}
      name={row.user_name}
      detail={
        <>
          <LiveLine live={row.live} now={now} />
          {split && (
            <span className="text-subhead text-muted-foreground tabular-nums">
              {split}
            </span>
          )}
        </>
      }
    >
      <WorkerName name={row.user_name} role={row.role} />
      {person?.clock_in_store_ids.map((storeId) => (
        <Badge
          key={storeId}
          variant="secondary"
          className="ml-1.5 align-text-bottom font-normal"
        >
          {storeCodes.get(storeId) ?? "?"}
        </Badge>
      ))}
    </PersonName>
  );
};

interface HelpHeaderProps {
  label: string;
  help: string;
}

export const HelpHeader = ({ label, help }: HelpHeaderProps) => (
  <Tooltip>
    <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4">
      {label}
    </TooltipTrigger>
    <TooltipContent>{help}</TooltipContent>
  </Tooltip>
);

export const OpenArrow = () => (
  <HugeiconsIcon
    icon={ArrowRight01Icon}
    aria-hidden="true"
    className="size-3.5 text-muted-foreground"
  />
);

const columnsFor = <T extends TableRow>(
  now: number,
  storeCodes: StoreCodes
): DataTableColumnDef<T>[] => [
  {
    id: "user_name",
    header: "Worker",
    meta: { width: { percent: 40, minRem: 14 } },
    cell: ({ row }) => (
      <RowName row={row.original} now={now} storeCodes={storeCodes} />
    ),
  },
  {
    id: "services",
    header: "Services",
    meta: { align: "right", width: { percent: 18, minRem: 6 } },
    cell: ({ row }) => (
      <span className="font-medium">{n(row.original.services_processed)}</span>
    ),
  },
  {
    id: "pace",
    header: "Pace",
    meta: { align: "right", width: { percent: 14, minRem: 5.5 } },
    cell: ({ row }) => (
      <Pace
        perDay={row.original.per_day_worked}
        detail={pluralCount(row.original.days_worked, "day")}
      />
    ),
  },
  {
    id: "qc_rejects",
    header: () => (
      <HelpHeader
        label="QC rejects"
        help="QC checks sent back on Items this worker cleaned. One Item can be sent back more than once."
      />
    ),
    meta: { align: "right", width: { percent: 12, minRem: 5 } },
    cell: ({ row }) => (
      <BadCount bad={row.original.qc_rejects} total={row.original.qc_checks} />
    ),
  },
  {
    id: "complaints",
    header: () => (
      <HelpHeader
        label="Complaints"
        help="Complaints on Services this worker cleaned that passed QC."
      />
    ),
    meta: { align: "right", width: { percent: 12, minRem: 5.5 } },
    cell: ({ row }) => (
      <BadCount
        bad={row.original.complaints}
        total={row.original.complaint_cohort}
      />
    ),
  },
  {
    id: "open",
    header: () => <span className="sr-only">Open</span>,
    meta: { width: { percent: 4, minRem: 1.75 } },
    cell: () => <OpenArrow />,
  },
];

interface WorkerCardProps<T extends TableRow> {
  row: T;
  now: number;
  storeCodes: StoreCodes;
  onOpen: (row: T) => void;
}

const WorkerCard = <T extends TableRow>({
  row,
  now,
  storeCodes,
  onOpen,
}: WorkerCardProps<T>) => (
  <button
    type="button"
    onClick={() => onOpen(row)}
    className="grid w-full gap-2 px-4 py-3 text-left text-body tabular-nums active:bg-muted/40"
  >
    <span className="flex items-center gap-2">
      <span className="min-w-0 flex-1">
        <RowName row={row} now={now} storeCodes={storeCodes} />
      </span>
      <span>
        <span className="font-medium">{n(row.services_processed)}</span>
        <span className="ml-1 text-muted-foreground">
          {row.services_processed === 1 ? "Service" : "Services"}
        </span>
      </span>
      <OpenArrow />
    </span>
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-subhead text-muted-foreground">
      {`${paceText(row.per_day_worked)} · ${pluralCount(row.days_worked, "day")}`}
      {row.qc_rejects > 0 && (
        <BadCount bad={row.qc_rejects} total={row.qc_checks} prefix="QC " />
      )}
      {row.complaints > 0 && (
        <BadCount
          bad={row.complaints}
          total={row.complaint_cohort}
          prefix="Complaints "
        />
      )}
    </span>
  </button>
);

interface WorkerListProps<T extends TableRow> {
  rows: T[];
  now: number;
  onOpen: (row: T) => void;
  isInsideCard?: boolean;
}

const WorkerList = <T extends TableRow>({
  rows,
  now,
  onOpen,
  isInsideCard,
}: WorkerListProps<T>) => {
  const storeCodes = useStoreCodes();
  const columns = columnsFor<T>(now, storeCodes);
  return (
    <DataTable
      emptyIcon={UserGroupIcon}
      columns={columns}
      data={rows}
      onRowOpen={onOpen}
      isInsideCard={isInsideCard}
      renderCard={(row) => (
        <WorkerCard
          now={now}
          onOpen={onOpen}
          row={row}
          storeCodes={storeCodes}
        />
      )}
    />
  );
};

interface QuietStoresProps {
  workers: WorkerRow[];
  isToday: boolean;
}

// Every Store without a row folds into one line, so a quiet booth costs the
// owner no scrolling.
const QuietStores = ({ workers, isToday }: QuietStoresProps) => {
  const { data: stores = [] } = useQuery(storesQueries.list());
  const busy = new Set(workers.map((row) => row.store_id));
  const quiet = stores.filter(
    (store) => store.is_active && !busy.has(store.id)
  );
  if (quiet.length === 0) {
    return null;
  }
  return (
    <p className="rounded-lg border bg-card px-4 py-3 text-body text-muted-foreground">
      {`${isToday ? "No Services today" : "No Services in range"}: ${quiet.map((store) => store.code).join(", ")}`}
    </p>
  );
};

interface WorkersTableProps {
  workers: WorkerRow[];
  isAllStores: boolean;
  isToday: boolean;
  onOpen: (row: WorkerRow) => void;
}

// One table on every date range: what each person is doing right now on the
// left, the chosen range on the right.
export const WorkersTable = ({
  workers,
  isAllStores,
  isToday,
  onOpen,
}: WorkersTableProps) => {
  const now = useMinuteClock();
  const storeCodes = useStoreCodes();
  // Fixed at mount: the live view re-sorts every minute, and a Store the
  // owner closed must not pop open because another overtook it.
  const firstStoreId = useMountValue(() => groupByStore(workers)[0]?.store_id);
  if (workers.length === 0) {
    return <EmptyState icon={UserGroupIcon}>No worker activity</EmptyState>;
  }

  if (!isAllStores) {
    return <WorkerList rows={workers} now={now} onOpen={onOpen} />;
  }

  return (
    <div className="grid gap-2">
      {groupByStore(workers).map(({ store_id, store_name, rows, totals }) => (
        <StoreGroup
          key={store_id}
          storeCode={storeCodes.get(store_id) ?? store_name}
          totals={totals}
          isOpenAtStart={store_id === firstStoreId}
        >
          <WorkerList rows={rows} now={now} onOpen={onOpen} isInsideCard />
        </StoreGroup>
      ))}
      <QuietStores workers={workers} isToday={isToday} />
    </div>
  );
};

interface PeopleTableProps {
  people: PersonRow[];
  // Who cleans the picked Store's Items, for a booth nobody clocked in at.
  cleanedBy: string[];
  storeId?: number;
  onOpen: (row: PersonRow) => void;
}

export const PeopleTable = ({
  people,
  cleanedBy,
  storeId,
  onOpen,
}: PeopleTableProps) => {
  const now = useMinuteClock();
  const storeCodes = useStoreCodes();
  if (people.length > 0) {
    return <WorkerList rows={people} now={now} onOpen={onOpen} />;
  }
  if (storeId === undefined || cleanedBy.length === 0) {
    return <EmptyState icon={UserGroupIcon}>No worker activity</EmptyState>;
  }
  // A booth has no bench: name who cleans its Items instead.
  return (
    <EmptyState icon={UserGroupIcon}>
      {`${storeCodes.get(storeId) ?? "This Store's"} Items are cleaned by ${cleanedBy.join(", ")}`}
    </EmptyState>
  );
};
