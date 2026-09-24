import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-picker";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import type { ReportGranularity } from "@/features/reports/api";
import {
	DEFAULT_PRESET,
	rangeLabel,
} from "@/features/reports/utils/report-filters";
import { storesQueries } from "@/features/stores/api";
import { cn } from "@/lib/utils";
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

const FIELD_LABEL =
	"font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground";

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

	const activeBadges: { id: string; label: string }[] = [];
	if (showRangeFilters) {
		activeBadges.push({
			id: "range",
			label: rangeLabel({ preset, from, to }),
		});
	}
	activeBadges.push({
		id: "store",
		label: activeStore ? activeStore.code : "All stores",
	});
	if (showGranularity && granularity) {
		activeBadges.push({ id: "granularity", label: granularity });
	}

	const activeGranularity: ReportGranularity | "auto" = granularity ?? "auto";

	return (
		<div className="flex flex-wrap items-center gap-2">
			{activeBadges.map((badge) => (
				<Badge
					key={badge.id}
					variant="outline"
					className="h-8 max-w-40 truncate px-2 text-xs"
				>
					{badge.label}
				</Badge>
			))}
			<Popover>
				<PopoverTrigger
					render={
						<Button variant="outline" icon={<FunnelSimpleIcon />}>
							Filters
							{nonDefaultCount > 0 && (
								<span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center bg-foreground px-1 text-[10px] font-semibold text-background">
									{nonDefaultCount}
								</span>
							)}
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
							<div className="grid grid-cols-5 gap-1">
								{GRANULARITY_OPTIONS.map((option) => {
									const isActive = activeGranularity === option.id;
									return (
										<button
											type="button"
											key={option.id}
											onClick={() =>
												onGranularityChange(
													option.id === "auto" ? undefined : option.id,
												)
											}
											className={cn(
												"border px-1 py-1.5 text-[11px]",
												isActive
													? "border-foreground bg-foreground text-background"
													: "border-border/70 text-muted-foreground hover:text-foreground",
											)}
										>
											{option.label}
										</button>
									);
								})}
							</div>
						</div>
					) : null}
					<StoreAutocomplete
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
		</div>
	);
};
