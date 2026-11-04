import { FilterHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { FilterPanel } from "@/components/filter-panel";
import { SegmentedFilter } from "@/components/segmented-filter";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-picker";
import { Field, FieldLabel } from "@/components/ui/field";
import { StoreSelect } from "@/features/orders/components/store-select";
import type { ReportGranularity } from "@/features/reports/api";
import {
	DEFAULT_PRESET,
	type ReportFilterValues,
	rangeLabel,
	resetReportFilters,
	withPresetRange,
} from "@/features/reports/utils/report-filters";
import { storesQueries } from "@/features/stores/api";

interface ReportFiltersProps {
	values: ReportFilterValues;
	onApply: (values: ReportFilterValues) => void;
	showRangeFilters?: boolean;
	showGranularity?: boolean;
}

const GRANULARITY_OPTIONS = [
	["auto", "Auto"],
	["day", "Day"],
	["week", "Week"],
	["month", "Month"],
	["year", "Year"],
] as const;

export const ReportFilters = ({
	values,
	onApply,
	showRangeFilters = true,
	showGranularity = true,
}: ReportFiltersProps) => {
	const storesQuery = useQuery(storesQueries.list());
	const activeStore = storesQuery.data?.find(
		(store) => store.id === values.store_id,
	);

	const countOf = (v: ReportFilterValues) =>
		(showRangeFilters && v.preset !== DEFAULT_PRESET ? 1 : 0) +
		(v.store_id === undefined ? 0 : 1) +
		(showGranularity && v.granularity !== undefined ? 1 : 0);

	// The button reads what the report shows, so the filter state is never a
	// second row of look-alike pills that do nothing when tapped.
	const summary = [
		showRangeFilters ? rangeLabel(values) : null,
		activeStore ? activeStore.code : "All stores",
		showGranularity && values.granularity
			? GRANULARITY_OPTIONS.find(([id]) => id === values.granularity)?.[1]
			: null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<FilterPanel
			value={values}
			countOf={countOf}
			clear={(v) =>
				withPresetRange({ ...v, ...resetReportFilters(showRangeFilters) })
			}
			onApply={onApply}
			// The button reads out the range: it's the only place the page says
			// which days its numbers cover.
			trigger={
				// One width whatever the summary says, so picking a Store or
				// switching tabs never slides the button along the header.
				<Button
					variant="outline"
					icon={<HugeiconsIcon icon={FilterHorizontalIcon} />}
					className="w-44 min-w-0 justify-start sm:w-64"
				>
					<span className="truncate">{summary}</span>
				</Button>
			}
		>
			{(draft, setDraft) => (
				<div className="grid gap-4">
					{showRangeFilters ? (
						<Field>
							<FieldLabel htmlFor="reports-range">Range</FieldLabel>
							<DateRangePicker
								id="reports-range"
								fullWidth
								from={draft.from}
								to={draft.to}
								preset={draft.preset}
								isPresetKept
								commitOnComplete
								onChange={(next) => {
									if (next.from && next.to) {
										setDraft({
											from: next.from,
											to: next.to,
											preset: next.preset,
										});
									}
								}}
							/>
						</Field>
					) : null}
					{showGranularity ? (
						<SegmentedFilter<ReportGranularity>
							id="reports-granularity"
							label="Granularity"
							emptyValue="auto"
							options={GRANULARITY_OPTIONS}
							value={draft.granularity}
							onValueChange={(granularity) => setDraft({ granularity })}
						/>
					) : null}
					<StoreSelect
						id="reports-store"
						label="Store"
						value={draft.store_id !== undefined ? String(draft.store_id) : ""}
						onValueChange={(next) =>
							setDraft({ store_id: next ? Number(next) : undefined })
						}
						allOptionLabel="All stores"
					/>
				</div>
			)}
		</FilterPanel>
	);
};
