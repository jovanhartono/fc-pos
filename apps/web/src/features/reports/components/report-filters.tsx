import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-picker";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StoreSelect } from "@/features/orders/components/store-select";
import type { ReportGranularity } from "@/features/reports/api";
import {
	DEFAULT_PRESET,
	rangeLabel,
} from "@/features/reports/utils/report-filters";
import { storesQueries } from "@/features/stores/api";
import type { DatePreset } from "@/shared/date-presets";

interface ReportFiltersProps {
	from: string;
	to: string;
	preset?: DatePreset;
	onRangeChange: (range: {
		from: string;
		to: string;
		preset?: DatePreset;
	}) => void;
	storeId: number | undefined;
	onStoreChange: (storeId: number | undefined) => void;
	granularity?: ReportGranularity;
	onGranularityChange?: (granularity: ReportGranularity | undefined) => void;
	onReset: () => void;
	showRangeFilters?: boolean;
	showGranularity?: boolean;
}

const FIELD_LABEL = "text-subhead font-medium text-muted-foreground";

const GRANULARITY_OPTIONS: {
	id: ReportGranularity | "auto";
	label: string;
}[] = [
	{ id: "auto", label: "Auto" },
	{ id: "day", label: "Day" },
	{ id: "week", label: "Week" },
	{ id: "month", label: "Month" },
	{ id: "year", label: "Year" },
];

export const ReportFilters = ({
	from,
	to,
	preset,
	onRangeChange,
	storeId,
	onStoreChange,
	granularity,
	onGranularityChange,
	onReset,
	showRangeFilters = true,
	showGranularity = true,
}: ReportFiltersProps) => {
	const storesQuery = useQuery(storesQueries.list());
	const stores = storesQuery.data ?? [];
	const activeStore = stores.find((store) => store.id === storeId);

	const isRangeDefault = preset === DEFAULT_PRESET;
	const isStoreDefault = storeId === undefined;
	const isGranularityDefault = granularity === undefined;
	const nonDefaultCount =
		(showRangeFilters && !isRangeDefault ? 1 : 0) +
		(isStoreDefault ? 0 : 1) +
		(showGranularity && !isGranularityDefault ? 1 : 0);

	// The button reads what the report shows, so the filter state is never a
	// second row of look-alike pills that do nothing when tapped.
	const summary = [
		showRangeFilters ? rangeLabel({ preset, from, to }) : null,
		activeStore ? activeStore.code : "All stores",
		showGranularity && granularity
			? GRANULARITY_OPTIONS.find((option) => option.id === granularity)?.label
			: null,
	]
		.filter(Boolean)
		.join(" · ");

	const activeGranularity: ReportGranularity | "auto" = granularity ?? "auto";

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						icon={<FunnelSimpleIcon />}
						className="min-w-0"
					>
						<span className="truncate">{summary}</span>
					</Button>
				}
			/>
			<PopoverContent
				align="end"
				className="w-[min(20rem,calc(100vw-2rem))] gap-4 p-4"
			>
				{showRangeFilters ? (
					<div className="grid gap-2">
						<span className={FIELD_LABEL}>Range</span>
						<DateRangePicker
							from={from}
							to={to}
							preset={preset}
							isPresetKept
							commitOnComplete
							onChange={(next) => {
								if (next.from && next.to) {
									onRangeChange({
										from: next.from,
										to: next.to,
										preset: next.preset,
									});
								}
							}}
						/>
					</div>
				) : null}
				{showGranularity && onGranularityChange ? (
					<div className="grid gap-2">
						<span className={FIELD_LABEL}>Granularity</span>
						<Tabs
							value={activeGranularity}
							onValueChange={(value) =>
								onGranularityChange(
									value === "auto" ? undefined : (value as ReportGranularity),
								)
							}
						>
							<TabsList aria-label="Granularity" className="w-full">
								{GRANULARITY_OPTIONS.map((option) => (
									<TabsTrigger key={option.id} value={option.id}>
										{option.label}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>
					</div>
				) : null}
				<StoreSelect
					id="reports-store"
					label="Store"
					value={storeId !== undefined ? String(storeId) : ""}
					onValueChange={(next) =>
						onStoreChange(next ? Number(next) : undefined)
					}
					allOptionLabel="All stores"
				/>
				{nonDefaultCount > 0 && (
					<div className="flex justify-end border-border/70 border-t pt-3">
						<Button variant="ghost" size="sm" onClick={onReset}>
							Reset
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
};
