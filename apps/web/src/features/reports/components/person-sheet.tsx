import { useQuery } from "@tanstack/react-query";

import { Section } from "@/components/section";
import { reportsQueries } from "@/features/reports/api";
import type { PersonRow, WorkerDetailReport } from "@/features/reports/api";
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

interface StoreServicesChartProps {
  detail: WorkerDetailReport;
}

// One stripe per Order's Store, so a bench that cleans for a booth shows both.
const StoreServicesChart = ({ detail }: StoreServicesChartProps) => {
  const storeCodes = useStoreCodes();
  const axis = dateAxis(detail.bucket);
  // Days off at every Store leave the chart.
  const kept = detail.buckets.filter((bucket) => bucket.total !== null);
  const series: ChartSeries[] = detail.stores.map((store, index) => ({
    key: String(store.store_id),
    name: storeCodes.get(store.store_id) ?? store.store_name,
    fullName: store.store_name,
    values: kept.map(
      (bucket) =>
        bucket.by_store.find((part) => part.store_id === store.store_id)
          ?.count ?? 0
    ),
    color: topFourColor(index),
  }));
  const totalAt = (index: number | null) =>
    series.reduce((sum, s) => sum + valueAt(s, index), 0);

  return (
    <ReportChart
      labels={kept.map((bucket) => bucket.label)}
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

// The person's own sheet in By Worker: their detail across every Store, with
// the range figures from their row.
const PersonSheetContent = ({ target }: PersonSheetContentProps) => {
  const { person } = target;
  const openPersonSheet = useOpenPersonSheet();
  const query = useQuery(
    reportsQueries.workerDetail({
      from: target.from,
      to: target.to,
      user_id: person.user_id,
    })
  );

  if (query.isPending) {
    return <WorkerSheetPlaceholder />;
  }
  const { data } = query;
  if (!data) {
    return <WorkerLoadError onRetry={() => query.refetch()} />;
  }

  const { top } = splitTopServices(data.services);
  const topIds = top.map((s) => s.service_id);

  return (
    <div className={cn("grid gap-5", CONTENT_FADE)}>
      <WorkerFacts facts={person} />

      <Section title="Services Each Day">
        <StoreServicesChart detail={data} />
      </Section>

      <Section title="Services Worked">
        <ServicesTable services={data.services} topIds={topIds} />
      </Section>

      <Section
        title="QC Rejects by Service"
        count={count(data.facts.qc_rejects)}
      >
        <RejectCards
          back={{
            label: person.user_name,
            onClick: () => openPersonSheet(target),
          }}
          rejects={data.qc_rejects}
        />
      </Section>

      <Section
        title="Complaints by Service"
        count={count(data.facts.complaints)}
      >
        <ComplaintCards complaints={data.complaints} />
      </Section>
    </div>
  );
};
