import { useQueries } from "@tanstack/react-query";

import { Section } from "@/components/section";
import { reportsQueries } from "@/features/reports/api";
import type { WorkerDetailReport } from "@/features/reports/api";
import {
  dateAxis,
  headParts,
  ReportChart,
  valueAt,
} from "@/features/reports/components/report-chart";
import type { ChartSeries } from "@/features/reports/components/report-chart";
import {
  ComplaintCards,
  RejectCards,
  ServicesTable,
  WorkerFacts,
  WorkerLoadError,
  WorkerSheetPlaceholder,
  WorkerSheetTitle,
} from "@/features/reports/components/worker-sheet";
import { useStoreCodes } from "@/features/reports/hooks/use-store-codes";
import { numberFormatter, rangeLabel } from "@/features/reports/utils/format";
import { topFourColor } from "@/features/reports/utils/palette";
import { splitTopServices } from "@/features/reports/utils/workers-report";
import type { PersonRow } from "@/features/reports/utils/workers-report";
import { CONTENT_FADE } from "@/lib/content-fade";
import { cn } from "@/lib/utils";
import { useSheet } from "@/stores/sheet-store";

interface PersonSheetTarget {
  from: string;
  to: string;
  person: PersonRow;
}

const count = (value: number) => numberFormatter.format(value);

export const useOpenPersonSheet = () => {
  const openSheet = useSheet((s) => s.openSheet);
  const storeCodes = useStoreCodes();
  return (target: PersonSheetTarget) => {
    const { person } = target;
    const codes = person.row_store_ids.map((id) => storeCodes.get(id) ?? "?");
    openSheet({
      title: (
        <WorkerSheetTitle
          name={person.user_name}
          avatarUrl={person.avatar_url}
          role={person.role}
        />
      ),
      description: `${codes.join(" · ")} · ${rangeLabel(target.from, target.to)}`,
      content: () => <PersonSheetContent target={target} />,
    });
  };
};

// The same Service, QC reject group or Complaint group from several Stores
// becomes one entry with its counts added.
const mergeById = <T extends { service_id: number }>(
  lists: T[][],
  add: (a: T, b: T) => T
) => {
  const byId = new Map<number, T>();
  for (const entry of lists.flat()) {
    const seen = byId.get(entry.service_id);
    byId.set(entry.service_id, seen ? add(seen, entry) : entry);
  }
  return [...byId.values()];
};

// Newest first, the way each Store's list arrives; the server sends UTC ISO times.
const byNewest = (a: string, b: string) => b.localeCompare(a);

const mergeDetails = (details: WorkerDetailReport[]) => ({
  services: mergeById(
    details.map((d) => d.services),
    (a, b) => ({ ...a, count: a.count + b.count })
  ).toSorted(
    (a, b) => b.count - a.count || a.service_name.localeCompare(b.service_name)
  ),
  qc_rejects: mergeById(
    details.map((d) => d.qc_rejects),
    (a, b) => ({
      ...a,
      rejects: a.rejects + b.rejects,
      checks: a.checks + b.checks,
      items: [...a.items, ...b.items].toSorted((x, y) =>
        byNewest(x.rejected_at, y.rejected_at)
      ),
    })
  ).toSorted(
    (a, b) =>
      b.rejects - a.rejects || a.service_name.localeCompare(b.service_name)
  ),
  complaints: mergeById(
    details.map((d) => d.complaints),
    (a, b) => ({
      ...a,
      complaints: a.complaints + b.complaints,
      finished: a.finished + b.finished,
      items: [...a.items, ...b.items].toSorted(
        (x, y) =>
          byNewest(x.opened_at, y.opened_at) || y.complaint_id - x.complaint_id
      ),
    })
  ).toSorted(
    (a, b) =>
      b.complaints - a.complaints ||
      a.service_name.localeCompare(b.service_name)
  ),
});

interface StoreServicesChartProps {
  details: WorkerDetailReport[];
}

// One stripe per Order's Store, so a bench that cleans for a booth shows both.
const StoreServicesChart = ({ details }: StoreServicesChartProps) => {
  const storeCodes = useStoreCodes();
  const axis = dateAxis(details[0].bucket);
  // Days off at every Store leave the chart.
  const kept = details[0].buckets.flatMap((bucket, index) =>
    details.some((d) => d.buckets[index].total !== null)
      ? [{ label: bucket.label, index }]
      : []
  );
  const series: ChartSeries[] = details
    .toSorted((a, b) => b.facts.services_processed - a.facts.services_processed)
    .map((d, index) => ({
      key: String(d.store_id),
      name: storeCodes.get(d.store_id) ?? d.store_name,
      fullName: d.store_name,
      values: kept.map(({ index: at }) => d.buckets[at].total ?? 0),
      color: topFourColor(index),
    }));
  const totalAt = (index: number | null) =>
    series.reduce((sum, s) => sum + valueAt(s, index), 0);

  return (
    <ReportChart
      labels={kept.map((k) => k.label)}
      axis={axis}
      groups={[series]}
      formatAxis={count}
      head={(index) => {
        const parts = headParts(series, index, count);
        if (index === null) {
          return { label: "Services", value: count(totalAt(null)), parts };
        }
        const total = totalAt(index);
        return {
          label: axis.title(kept[index].label),
          value: count(total),
          caption: total === 0 ? "Worked, nothing reached QC" : "Services",
          parts,
        };
      }}
    />
  );
};

interface PersonSheetContentProps {
  target: PersonSheetTarget;
}

// The person's own sheet in By Worker: each Store's detail fetched and added
// up, with the range figures from their merged row.
const PersonSheetContent = ({ target }: PersonSheetContentProps) => {
  const { person } = target;
  const openPersonSheet = useOpenPersonSheet();
  const queries = useQueries({
    queries: person.row_store_ids.map((storeId) =>
      reportsQueries.workerDetail({
        from: target.from,
        to: target.to,
        store_id: storeId,
        user_id: person.user_id,
      })
    ),
  });

  if (queries.some((q) => q.isPending)) {
    return <WorkerSheetPlaceholder />;
  }
  const details = queries.flatMap((q) => (q.data ? [q.data] : []));
  if (details.length < queries.length) {
    return (
      <WorkerLoadError
        onRetry={() => {
          for (const q of queries) {
            void q.refetch();
          }
        }}
      />
    );
  }

  const merged = mergeDetails(details);
  const { top } = splitTopServices(merged.services);
  const topIds = top.map((s) => s.service_id);

  return (
    <div className={cn("grid gap-5", CONTENT_FADE)}>
      <WorkerFacts facts={person} />

      <Section title="Services Each Day">
        <StoreServicesChart details={details} />
      </Section>

      <Section title="Services Worked">
        <ServicesTable services={merged.services} topIds={topIds} />
      </Section>

      <Section title="QC Rejects by Service" count={count(person.qc_rejects)}>
        <RejectCards
          back={{
            label: person.user_name,
            onClick: () => openPersonSheet(target),
          }}
          rejects={merged.qc_rejects}
        />
      </Section>

      <Section title="Complaints by Service" count={count(person.complaints)}>
        <ComplaintCards complaints={merged.complaints} />
      </Section>
    </div>
  );
};
