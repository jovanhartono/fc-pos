import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ReportOverview } from "@/lib/api";
import {
	reportOverviewQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";
import { cn } from "@/lib/utils";
import { formatIDRCurrency } from "@/shared/utils";

interface DailyReportProps {
	date: string;
	storeId?: number;
	onDateChange: (date: string) => void;
	onStoreChange: (storeId: number | undefined) => void;
}

const numberFormatter = new Intl.NumberFormat("en-ID");

const dayShortFormatter = new Intl.DateTimeFormat("en-ID", {
	day: "2-digit",
	month: "short",
});

function escapeCsv(value: string | number | null | undefined): string {
	if (value === null || value === undefined) {
		return "";
	}
	const str = String(value);
	if (/[",\n]/.test(str)) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

function buildCsv(overview: ReportOverview): string {
	const lines: string[] = [];
	lines.push(`Report,Date,${escapeCsv(overview.date)}`);
	lines.push(`Report,Store ID,${escapeCsv(overview.store_id ?? "all")}`);
	lines.push("");

	lines.push("Summary,Metric,Value");
	lines.push(`Summary,Revenue,${overview.daily.revenue}`);
	lines.push(`Summary,Items processed,${overview.daily.items_processed}`);
	lines.push(`Summary,Orders in,${overview.daily.orders_in}`);
	lines.push(`Summary,Orders out,${overview.daily.orders_out}`);
	lines.push("");

	lines.push("Trend,Date,Orders in,Orders out,Revenue");
	for (const row of overview.trend) {
		lines.push(
			`Trend,${escapeCsv(row.date)},${row.orders_in},${row.orders_out},${row.revenue}`,
		);
	}
	lines.push("");

	lines.push("Categories,Category,Revenue,Line count");
	for (const row of overview.categories) {
		lines.push(
			`Categories,${escapeCsv(row.category_name)},${row.revenue},${row.count}`,
		);
	}
	lines.push("");

	lines.push("Top services,Service,Count,Revenue");
	for (const row of overview.top_services) {
		lines.push(
			`Top services,${escapeCsv(row.service_name)},${row.count},${row.revenue}`,
		);
	}
	lines.push("");

	lines.push("Per store,Store code,Store name,Revenue,Orders in,Orders out");
	for (const row of overview.per_store) {
		lines.push(
			`Per store,${escapeCsv(row.store_code)},${escapeCsv(row.store_name)},${row.revenue},${row.orders_in},${row.orders_out}`,
		);
	}

	return lines.join("\n");
}

function downloadCsv(overview: ReportOverview) {
	const csv = buildCsv(overview);
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	const scope =
		overview.store_id === null ? "all-stores" : `store-${overview.store_id}`;
	link.href = url;
	link.download = `fresclean-report-${overview.date}-${scope}.csv`;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

function KpiTile({
	label,
	value,
	helper,
}: {
	label: string;
	value: string;
	helper?: string;
}) {
	return (
		<Card className="border-border/70">
			<CardContent className="grid gap-1 p-4">
				<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
					{label}
				</p>
				<p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
				{helper ? (
					<p className="text-muted-foreground text-xs">{helper}</p>
				) : null}
			</CardContent>
		</Card>
	);
}

function TrendChart({ trend }: { trend: ReportOverview["trend"] }) {
	const maxY = useMemo(
		() =>
			Math.max(
				1,
				...trend.map((row) => Math.max(row.orders_in, row.orders_out)),
			),
		[trend],
	);

	const columnWidth = 32;
	const columnGap = 6;
	const chartHeight = 160;
	const topPadding = 8;
	const bottomPadding = 24;
	const axisLabelEvery = trend.length > 10 ? 2 : 1;

	return (
		<div className="overflow-x-auto">
			<svg
				role="img"
				aria-label="Orders in vs orders out trend"
				width={trend.length * (columnWidth + columnGap)}
				height={chartHeight + topPadding + bottomPadding}
				className="block"
			>
				<title>Orders in vs orders out trend</title>
				{trend.map((row, index) => {
					const x = index * (columnWidth + columnGap);
					const inHeight = (row.orders_in / maxY) * chartHeight;
					const outHeight = (row.orders_out / maxY) * chartHeight;
					const inY = topPadding + chartHeight - inHeight;
					const outY = topPadding + chartHeight - outHeight;
					const barWidth = (columnWidth - 4) / 2;
					const label = dayShortFormatter.format(
						new Date(`${row.date}T00:00:00+07:00`),
					);
					return (
						<g key={row.date}>
							<rect
								x={x}
								y={inY}
								width={barWidth}
								height={Math.max(0, inHeight)}
								className="fill-foreground"
							/>
							<rect
								x={x + barWidth + 2}
								y={outY}
								width={barWidth}
								height={Math.max(0, outHeight)}
								className="fill-muted-foreground/60"
							/>
							{index % axisLabelEvery === 0 ? (
								<text
									x={x + columnWidth / 2}
									y={chartHeight + topPadding + 14}
									textAnchor="middle"
									className="fill-muted-foreground font-mono text-[9px]"
								>
									{label}
								</text>
							) : null}
						</g>
					);
				})}
			</svg>
		</div>
	);
}

function CategoryBars({
	categories,
}: {
	categories: ReportOverview["categories"];
}) {
	const max = useMemo(
		() => categories.reduce((m, row) => Math.max(m, row.revenue), 0),
		[categories],
	);

	if (categories.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">No service lines today.</p>
		);
	}

	return (
		<div className="grid gap-2">
			{categories.map((row) => {
				const pct = max === 0 ? 0 : (row.revenue / max) * 100;
				return (
					<div key={row.category_id} className="grid gap-1">
						<div className="flex items-center justify-between gap-2">
							<span className="truncate text-sm font-medium">
								{row.category_name}
							</span>
							<span className="font-mono text-sm tabular-nums">
								{formatIDRCurrency(String(row.revenue))}
							</span>
						</div>
						<div className="h-1.5 w-full bg-muted">
							<div
								className="h-full bg-foreground"
								style={{ width: `${pct}%` }}
							/>
						</div>
						<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
							{`${numberFormatter.format(row.count)} lines`}
						</span>
					</div>
				);
			})}
		</div>
	);
}

function PerStoreGrid({ perStore }: { perStore: ReportOverview["per_store"] }) {
	const max = useMemo(
		() => perStore.reduce((m, row) => Math.max(m, row.revenue), 0),
		[perStore],
	);

	return (
		<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
			{perStore.map((row) => {
				const pct = max === 0 ? 0 : (row.revenue / max) * 100;
				return (
					<Card key={row.store_id} className="border-border/70">
						<CardContent className="grid gap-2 p-4">
							<div className="flex items-center justify-between gap-2">
								<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
									{row.store_code}
								</span>
								<span className="truncate text-xs text-muted-foreground">
									{row.store_name}
								</span>
							</div>
							<p className="font-mono text-lg font-semibold tabular-nums">
								{formatIDRCurrency(String(row.revenue))}
							</p>
							<div className="h-1.5 w-full bg-muted">
								<div
									className="h-full bg-foreground"
									style={{ width: `${pct}%` }}
								/>
							</div>
							<div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
								<span>{`${row.orders_in} in`}</span>
								<span>{`${row.orders_out} out`}</span>
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}

function TopServicesList({
	services,
}: {
	services: ReportOverview["top_services"];
}) {
	if (services.length === 0) {
		return <p className="text-sm text-muted-foreground">No services today.</p>;
	}

	return (
		<div className="grid gap-2">
			{services.map((row) => (
				<div
					key={row.service_id}
					className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0"
				>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium">{row.service_name}</p>
						<p className="font-mono text-[11px] tabular-nums text-muted-foreground">
							{`${numberFormatter.format(row.count)} sold`}
						</p>
					</div>
					<p className="font-mono text-sm tabular-nums">
						{formatIDRCurrency(String(row.revenue))}
					</p>
				</div>
			))}
		</div>
	);
}

export const DailyReport = ({
	date,
	storeId,
	onDateChange,
	onStoreChange,
}: DailyReportProps) => {
	const overviewQuery = useQuery(
		reportOverviewQueryOptions({ date, store_id: storeId, trend_days: 14 }),
	);
	const storesQuery = useQuery(storesQueryOptions());
	const stores = storesQuery.data ?? [];
	const overview = overviewQuery.data;

	return (
		<div className="grid gap-6">
			<div className="flex flex-wrap items-end gap-3">
				<div className="grid gap-1">
					<label
						htmlFor="report-date"
						className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]"
					>
						Date (Asia/Jakarta)
					</label>
					<Input
						id="report-date"
						type="date"
						value={date}
						max={dayjs().format("YYYY-MM-DD")}
						onChange={(event) => {
							if (event.target.value) {
								onDateChange(event.target.value);
							}
						}}
					/>
				</div>
				<div className="grid gap-1">
					<label
						htmlFor="report-store"
						className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]"
					>
						Store
					</label>
					<Select
						value={storeId !== undefined ? String(storeId) : "all"}
						onValueChange={(value) =>
							onStoreChange(
								!value || value === "all" ? undefined : Number(value),
							)
						}
					>
						<SelectTrigger id="report-store" size="md" className="min-w-48">
							<SelectValue placeholder="All stores" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All stores</SelectItem>
							{stores.map((store) => (
								<SelectItem key={store.id} value={String(store.id)}>
									{store.code} · {store.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Button
					type="button"
					variant="outline"
					className="ml-auto"
					disabled={!overview}
					onClick={() => {
						if (overview) {
							downloadCsv(overview);
						}
					}}
					icon={<DownloadSimpleIcon className="size-4" />}
				>
					Export CSV
				</Button>
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<KpiTile
					label="Revenue"
					value={formatIDRCurrency(String(overview?.daily.revenue ?? 0))}
					helper="Paid minus refunded"
				/>
				<KpiTile
					label="Items processed"
					value={numberFormatter.format(overview?.daily.items_processed ?? 0)}
					helper="Moved to QC or ready"
				/>
				<KpiTile
					label="Orders in"
					value={numberFormatter.format(overview?.daily.orders_in ?? 0)}
					helper="Created today"
				/>
				<KpiTile
					label="Orders out"
					value={numberFormatter.format(overview?.daily.orders_out ?? 0)}
					helper="Picked up today"
				/>
			</div>

			<Card className="border-border/70">
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						{`Orders in vs out · last ${overview?.trend_days ?? 14} days`}
					</CardTitle>
					<div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em]">
						<span className="flex items-center gap-1">
							<span className="size-2 bg-foreground" />
							In
						</span>
						<span className="flex items-center gap-1">
							<span className="size-2 bg-muted-foreground/60" />
							Out
						</span>
					</div>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					{overview ? (
						<TrendChart trend={overview.trend} />
					) : (
						<div className="h-44 animate-pulse bg-muted/40" />
					)}
				</CardContent>
			</Card>

			<div className="grid gap-3 xl:grid-cols-2">
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
							Revenue by category
						</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-0">
						<CategoryBars categories={overview?.categories ?? []} />
					</CardContent>
				</Card>
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
							Top services today
						</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-0">
						<TopServicesList services={overview?.top_services ?? []} />
					</CardContent>
				</Card>
			</div>

			<div className={cn("grid gap-3")}>
				<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
					Per store · today
				</p>
				<PerStoreGrid perStore={overview?.per_store ?? []} />
			</div>
		</div>
	);
};
