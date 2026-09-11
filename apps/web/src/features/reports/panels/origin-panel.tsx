import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/features/reports/components/export-button";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import {
	csvFilename,
	downloadCsv,
	escapeCsv,
} from "@/features/reports/utils/csv";
import {
	numberFormatter,
	percentFormatter,
} from "@/features/reports/utils/format";
import type { OriginRankingReport, ReportGranularity } from "@/lib/api";
import { originRankingQueryOptions } from "@/lib/query-options";
import { formatMoney } from "@/shared/money";

interface OriginPanelProps {
	from: string;
	to: string;
	storeId?: number;
	granularity?: ReportGranularity;
}

type OriginCity = OriginRankingReport["cities"][number];

export const OriginPanel = ({
	from,
	to,
	storeId,
	granularity,
}: OriginPanelProps) => {
	const query = useQuery(
		originRankingQueryOptions({ from, to, store_id: storeId, granularity }),
	);
	const data = query.data;
	const cities: OriginCity[] = data?.cities ?? [];
	const coverage = data?.coverage;
	const maxOrders = cities.reduce((max, city) => Math.max(max, city.orders), 0);

	const handleExport = () => {
		if (!data) {
			return;
		}
		const lines: string[] = ["Origin,City,Province,Orders,Revenue"];
		for (const city of cities) {
			lines.push(
				`Origin,${escapeCsv(city.city)},${escapeCsv(city.province)},${city.orders},${city.revenue}`,
			);
		}
		downloadCsv(
			csvFilename("origin-ranking", data.from, data.to, data.store_id),
			lines.join("\n"),
		);
	};

	return (
		<div className="grid gap-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<KpiRow>
					<KpiCard
						label="Cities"
						value={numberFormatter.format(cities.length)}
						helper="Distinct origins recorded"
					/>
					{/* Every courier and shipped-in order, not just the ones with an
					    origin — otherwise the count reads as the shop's whole
					    non-counter volume while silently dropping the blanks. */}
					<KpiCard
						label="Orders not walked in"
						value={numberFormatter.format(coverage?.eligible ?? 0)}
						helper="Collected by courier or shipped in"
					/>
					{/* Without this the panel lies by omission: a column nobody fills
					    looks exactly like a short ranking. */}
					<KpiCard
						label="Origin known"
						value={percentFormatter.format(coverage?.pct ?? 0)}
						helper={`${numberFormatter.format(coverage?.known ?? 0)} of ${numberFormatter.format(coverage?.eligible ?? 0)} eligible orders`}
					/>
				</KpiRow>
				<ExportButton disabled={!data} onClick={handleExport} />
			</div>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						Where the items came from
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					{cities.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No order with a recorded origin in this range.
						</p>
					) : (
						<div className="grid gap-3">
							{cities.map((city) => {
								const pct =
									maxOrders === 0 ? 0 : (city.orders / maxOrders) * 100;
								return (
									<div className="grid gap-1" key={city.city}>
										<div className="flex items-center justify-between gap-2">
											<span className="truncate text-sm font-medium">
												{city.city}
											</span>
											<span className="font-mono text-sm tabular-nums">
												{`${numberFormatter.format(city.orders)} order${city.orders === 1 ? "" : "s"}`}
											</span>
										</div>
										<div className="h-1.5 w-full bg-muted">
											<div
												className="h-full bg-foreground"
												style={{ width: `${pct}%` }}
											/>
										</div>
										<div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
											<span>{city.province}</span>
											<span>{formatMoney(city.revenue)}</span>
										</div>
									</div>
								);
							})}
						</div>
					)}
					{/* Walk-ins carry no origin by design (ADR-0020), and they are most
					    of the shop's volume. */}
					<p className="mt-4 text-[11px] text-muted-foreground">
						Walk-ins are not counted here. Read this as demand the shop does not
						already serve over a counter.
					</p>
				</CardContent>
			</Card>
		</div>
	);
};

export default OriginPanel;
