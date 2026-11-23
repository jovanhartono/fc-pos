import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Section } from "@/components/section";
import { TextSkeleton } from "@/components/text-skeleton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { reportsQueries } from "@/features/reports/api";
import type { WorkerRow } from "@/features/reports/api";
import { AllStoresButton } from "@/features/reports/components/all-stores-button";
import { ExportButton } from "@/features/reports/components/export-button";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import { NeedsALook } from "@/features/reports/components/needs-a-look";
import { useOpenPersonSheet } from "@/features/reports/components/person-sheet";
import { ServicesByWorker } from "@/features/reports/components/services-by-worker";
import { useOpenWorkerSheet } from "@/features/reports/components/worker-sheet";
import {
  PeopleTable,
  WorkersTable,
} from "@/features/reports/components/workers-table";
import { useStoreCodes } from "@/features/reports/hooks/use-store-codes";
import { csvFilename, downloadCsv } from "@/features/reports/utils/csv";
import {
  numberFormatter,
  oneDecimalFormatter,
  percentFormatter,
} from "@/features/reports/utils/format";
import {
  buildWorkersCsv,
  outOf,
  withLive,
  workedAt,
} from "@/features/reports/utils/workers-report";
import type {
  PersonRow,
  WorkersView,
} from "@/features/reports/utils/workers-report";
import { staleFade } from "@/lib/content-fade";
import { cn } from "@/lib/utils";

interface WorkersPanelProps {
  from: string;
  to: string;
  storeId?: number;
  view: WorkersView;
  // Undefined is All stores.
  onStoreChange: (storeId: number | undefined) => void;
  onViewChange: (view: WorkersView) => void;
}

// oxlint-disable-next-line eslint/complexity -- one flat panel; the count is its `??` fallbacks for a report still loading
export const WorkersPanel = ({
  from,
  to,
  storeId,
  view,
  onStoreChange,
  onViewChange,
}: WorkersPanelProps) => {
  const query = useQuery({
    ...reportsQueries.workerProductivity({ from, to, store_id: storeId }),
    placeholderData: keepPreviousData,
  });
  const liveQuery = useQuery({
    ...reportsQueries.workerLive({ store_id: storeId }),
    placeholderData: keepPreviousData,
  });
  // By Worker shows each person's whole range, wherever the Store filter points.
  const isByWorker = view === "worker";
  const needsAllStores = isByWorker && storeId !== undefined;
  const allStoresQuery = useQuery({
    ...reportsQueries.workerProductivity({ from, to }),
    enabled: needsAllStores,
    placeholderData: keepPreviousData,
  });
  const allStoresLiveQuery = useQuery({
    ...reportsQueries.workerLive({}),
    enabled: needsAllStores,
  });
  const openWorkerSheet = useOpenWorkerSheet();
  const openPersonSheet = useOpenPersonSheet();
  const storeCodes = useStoreCodes();
  const { data } = query;
  const workers = data ? withLive(data.workers, liveQuery.data) : [];
  const allStores = allStoresQuery.data;
  // Undefined while every Store's rows are on their way, so one Store's rows
  // never pass for a person's whole range.
  let peopleWorkers: WorkerRow[] | undefined = workers;
  if (needsAllStores) {
    peopleWorkers =
      allStores?.store_id === null && !allStoresLiveQuery.isPending
        ? withLive(allStores.workers, allStoresLiveQuery.data)
        : undefined;
  }
  // A failed live view still shows the range, just with nobody on the floor.
  const isReady = data && !liveQuery.isPending;

  if (!query.isPending && !data) {
    return (
      <div className="flex items-center gap-3 text-body text-muted-foreground">
        Couldn&apos;t load the Workers report.
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const current = data?.summary.current;
  const isAllStores = storeId === undefined;
  const hasDaysWorked = (current?.days_worked ?? 0) > 0;
  // Part of today against all of yesterday would read as a drop every morning.
  const shownDeltas = data?.is_today ? null : data?.summary.deltas;
  const canExport = data && (!isByWorker || peopleWorkers);
  const handleExport = () => {
    if (!canExport) {
      return;
    }
    downloadCsv(
      csvFilename("worker-productivity", data.from, data.to, data.store_id),
      buildWorkersCsv(
        data,
        isByWorker && peopleWorkers
          ? { people: workedAt(peopleWorkers, storeId), storeCodes }
          : undefined
      )
    );
  };
  const allStoresLink = isAllStores ? null : (
    <AllStoresButton onClick={() => onStoreChange(undefined)} />
  );
  const handleOpen = (row: WorkerRow) => {
    if (!data) {
      return;
    }
    openWorkerSheet({
      from: data.from,
      to: data.to,
      storeId: row.store_id,
      storeName: row.store_name,
      userId: row.user_id,
      userName: row.user_name,
      avatarUrl: row.avatar_url,
      role: row.role,
    });
  };
  const handleOpenPerson = (row: PersonRow) => {
    if (!data) {
      return;
    }
    openPersonSheet({ from: data.from, to: data.to, person: row });
  };

  return (
    <div
      className={cn(
        "grid gap-6",
        staleFade(
          query.isPlaceholderData ||
            liveQuery.isPlaceholderData ||
            (needsAllStores && allStoresQuery.isPlaceholderData)
        )
      )}
    >
      <ExportButton disabled={!canExport} onClick={handleExport} />
      <KpiRow isPending={!data}>
        <KpiCard
          label="Services processed"
          value={numberFormatter.format(current?.services_processed ?? 0)}
          delta={shownDeltas?.services_processed ?? null}
          helper="First reached QC"
        />
        <KpiCard
          label="Per day worked"
          value={
            hasDaysWorked
              ? oneDecimalFormatter.format(current?.per_day_worked ?? 0)
              : "—"
          }
          delta={hasDaysWorked ? (shownDeltas?.per_day_worked ?? null) : null}
        />
        <KpiCard
          label="QC reject rate"
          value={percentFormatter.format(current?.qc_reject_rate ?? 0)}
          delta={shownDeltas?.qc_reject_rate ?? null}
          deltaAs="points"
          isLowerBetter
          helper={
            current ? (
              `${outOf(current.qc_rejects, current.qc_checks)} ${current.qc_checks === 1 ? "check" : "checks"}`
            ) : (
              <TextSkeleton className="w-28" />
            )
          }
        />
        <KpiCard
          label="Complaint rate"
          value={percentFormatter.format(current?.complaint_rate ?? 0)}
          delta={shownDeltas?.complaint_rate ?? null}
          deltaAs="points"
          isLowerBetter
          helper={
            current ? (
              `${outOf(current.complaints, current.complaint_cohort)} finished`
            ) : (
              <TextSkeleton className="w-20" />
            )
          }
        />
      </KpiRow>

      {isReady ? (
        <>
          <NeedsALook workers={workers} />

          <Section
            id="workers-rows"
            title="Workers"
            aside={
              <span className="flex items-center gap-2">
                {allStoresLink}
                <Tabs
                  value={view}
                  onValueChange={(value) => onViewChange(value as WorkersView)}
                >
                  <TabsList aria-label="Group Workers">
                    <TabsTrigger value="worker">By Worker</TabsTrigger>
                    <TabsTrigger value="store">By Store</TabsTrigger>
                  </TabsList>
                </Tabs>
              </span>
            }
          >
            {isByWorker && !peopleWorkers && (
              <Skeleton className="h-80 rounded-lg" />
            )}
            {isByWorker && peopleWorkers && (
              <PeopleTable
                workers={peopleWorkers}
                storeId={storeId}
                onOpen={handleOpenPerson}
              />
            )}
            {!isByWorker && (
              <WorkersTable
                // A new range opens its own busiest Store.
                key={`${data.from}:${data.to}:${workers.length > 0}`}
                workers={workers}
                isAllStores={isAllStores}
                isToday={data.is_today}
                onOpen={handleOpen}
              />
            )}
          </Section>

          <Section
            id="workers-services"
            title="Services by Worker"
            aside={allStoresLink}
          >
            <ServicesByWorker
              data={data}
              isAllStores={isAllStores}
              onStoreChange={onStoreChange}
            />
          </Section>
        </>
      ) : (
        <Skeleton className="h-80 rounded-lg" />
      )}
    </div>
  );
};
