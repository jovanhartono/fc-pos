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
import {
	type DatePreset,
	defaultRange,
	getPresets,
	matchPreset,
} from "@/features/reports/utils/report-filters";
import type { ReportGranularity } from "@/lib/api";
import { storesQueryOptions } from "@/lib/query-options";
import { cn } from "@/lib/utils";

interface ReportFiltersProps {
	from: string;
	to: string;
	onRangeChange: (range: { from: string; to: string }) => void;
	storeId: number | undefined;
	onStoreChange: (storeId: number | undefined) => void;
	granularity?: ReportGranularity;
	onGranularityChange?: (granularity: ReportGranularity | undefined) => void;
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
	onRangeChange,
	storeId,
	onStoreChange,
	granularity,
	onGranularityChange,
	showRangeFilters = true,
	showGranularity = true,
}: ReportFiltersProps) => {
	const presets = getPresets();
	const storesQuery = useQuery(storesQueryOptions());
	const stores = storesQuery.data ?? [];
	const activePreset = matchPreset(presets, from, to);
	const defaults = defaultRange();
	const activeStore = stores.find((store) => store.id === storeId);

	const isRangeDefault = from === defaults.from && to === defaults.to;
	const isStoreDefault = storeId === undefined;
	const isGranularityDefault = granularity === undefined;
	const nonDefaultCount =
		(showRangeFilters && !isRangeDefault ? 1 : 0) +
		(isStoreDefault ? 0 : 1) +
		(showGranularity && !isGranularityDefault ? 1 : 0);

	const activeBadges: { id: string; label: string }[] = [];
	if (showRangeFilters) {
		const preset = presets.find((p) => p.id === activePreset);
		activeBadges.push({
			id: "range",
			label: preset ? preset.label : `${from} → ${to}`,
		});
	}
	activeBadges.push({
		id: "store",
		label: activeStore ? activeStore.code : "All stores",
	});
	if (showGranularity && granularity) {
		activeBadges.push({ id: "granularity", label: granularity });
	}

	const handleReset = () => {
		if (showRangeFilters) {
			onRangeChange(defaults);
		}
		onStoreChange(undefined);
		onGranularityChange?.(undefined);
	};

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
					{showRangeFilters && (
						<div className="grid gap-2">
							<span className={FIELD_LABEL}>Preset</span>
							<div className="grid grid-cols-2 gap-1">
								{presets.map((preset) => (
									<button
										type="button"
										key={preset.id}
										onClick={() =>
											onRangeChange({ from: preset.from, to: preset.to })
										}
										className={cn(
											"border px-2 py-1.5 text-xs",
											activePreset === (preset.id as DatePreset)
												? "border-foreground bg-foreground text-background"
												: "border-border/70 text-muted-foreground hover:text-foreground",
										)}
									>
										{preset.label}
									</button>
								))}
							</div>
						</div>
					)}
					{showRangeFilters && (
						<div className="grid gap-2">
							<span className={FIELD_LABEL}>Range</span>
							<DateRangePicker
								from={from}
								to={to}
								commitOnComplete
								onChange={(next) => {
									if (next.from && next.to) {
										onRangeChange({ from: next.from, to: next.to });
									}
								}}
							/>
						</div>
					)}
					{showGranularity && onGranularityChange && (
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
					)}
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
							<Button variant="ghost" size="sm" onClick={handleReset}>
								Reset
							</Button>
						</div>
					)}
				</PopoverContent>
			</Popover>
		</div>
	);
};
