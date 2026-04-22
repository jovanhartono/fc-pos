import { WarningCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import type { DashboardOverview } from "@/lib/api";
import { dashboardOverviewQueryOptions } from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";

const numberFormatter = new Intl.NumberFormat("en-ID");

type PerStoreEntry = DashboardOverview["per_store_today"][number];

const PerStoreCard = ({
	store,
	maxRevenue,
}: {
	store: PerStoreEntry;
	maxRevenue: number;
}) => {
	const pct = maxRevenue === 0 ? 0 : (store.revenue / maxRevenue) * 100;

	return (
		<Card className="border-border/70">
			<CardContent className="grid gap-3 p-4">
				<div className="flex items-center justify-between gap-2">
					<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						{store.store_code}
					</span>
					<span className="truncate text-xs text-muted-foreground">
						{store.store_name}
					</span>
				</div>
				<p className="font-mono text-lg font-semibold tabular-nums">
					{formatIDRCurrency(String(store.revenue))}
				</p>
				<div className="h-1.5 w-full bg-muted">
					<div
						className="h-full bg-foreground transition-all"
						style={{ width: `${pct}%` }}
					/>
				</div>
				<div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
					<span>{`${store.orders_in} orders`}</span>
					<span>{`${store.queue_depth} queue`}</span>
				</div>
			</CardContent>
		</Card>
	);
};

type TopService = DashboardOverview["top_services_week"][number];

const TopServicesCard = ({ services }: { services: TopService[] }) => {
	return (
		<Card className="border-border/70">
			<CardHeader>
				<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
					Top services · last 7 days
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-2 p-4 pt-0">
				{services.length === 0 ? (
					<p className="text-sm text-muted-foreground">No services yet.</p>
				) : (
					services.map((service) => (
						<div
							key={service.service_id}
							className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">
									{service.service_name}
								</p>
								<p className="font-mono text-[11px] tabular-nums text-muted-foreground">
									{`${numberFormatter.format(service.count)} sold`}
								</p>
							</div>
							<p className="font-mono text-sm tabular-nums">
								{formatIDRCurrency(String(service.revenue))}
							</p>
						</div>
					))
				)}
			</CardContent>
		</Card>
	);
};

type Risks = DashboardOverview["risks"];

const RiskStrip = ({ risks }: { risks: Risks }) => {
	const hasOldest = risks.oldest_open_order !== null;
	const anyRisk =
		hasOldest ||
		risks.unclaimed_orders_count > 0 ||
		risks.low_stock_products_count > 0 ||
		risks.expired_campaigns_count > 0;

	return (
		<Card className="border-border/70">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
					<WarningCircleIcon className="size-3" />
					Risks
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-2 p-4 pt-0">
				{anyRisk ? null : (
					<p className="text-sm text-muted-foreground">
						Nothing flagged right now.
					</p>
				)}
				{risks.oldest_open_order ? (
					<RiskRow
						label="Oldest open order"
						value={`${risks.oldest_open_order.order_code} · ${risks.oldest_open_order.hours_open.toFixed(1)}h`}
						to="/orders/$orderId"
						params={{ orderId: String(risks.oldest_open_order.order_id) }}
					/>
				) : null}
				{risks.unclaimed_orders_count > 0 ? (
					<RiskRow
						label="Unclaimed > 30 days"
						value={numberFormatter.format(risks.unclaimed_orders_count)}
					/>
				) : null}
				{risks.low_stock_products_count > 0 ? (
					<RiskRow
						label="Low-stock products"
						value={numberFormatter.format(risks.low_stock_products_count)}
						to="/products"
					/>
				) : null}
				{risks.expired_campaigns_count > 0 ? (
					<RiskRow
						label="Expired active campaigns"
						value={numberFormatter.format(risks.expired_campaigns_count)}
						to="/campaigns"
						search={{ page: 1 }}
					/>
				) : null}
			</CardContent>
		</Card>
	);
};

const RiskRow = ({
	label,
	value,
	to,
	params,
	search,
}: {
	label: string;
	value: string;
	to?: string;
	params?: Record<string, string>;
	search?: Record<string, unknown>;
}) => {
	const content = (
		<div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
			<p className="text-sm">{label}</p>
			<p className="font-mono text-sm font-medium tabular-nums">{value}</p>
		</div>
	);

	if (!to) {
		return content;
	}

	return (
		<Link
			to={to}
			params={params}
			search={search}
			className="block transition-colors hover:bg-muted/40"
		>
			{content}
		</Link>
	);
};

const DashboardPage = () => {
	const { data, isPending } = useQuery(dashboardOverviewQueryOptions());

	const maxRevenue = useMemo(() => {
		if (!data) {
			return 0;
		}
		return data.per_store_today.reduce(
			(max, store) => Math.max(max, store.revenue),
			0,
		);
	}, [data]);

	if (isPending || !data) {
		return (
			<>
				<PageHeader title="Dashboard" />
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					{Array.from({ length: 4 }, (_, index) => (
						<div
							key={index}
							className="h-28 animate-pulse border border-border bg-muted/40"
						/>
					))}
				</div>
			</>
		);
	}

	const dateLabel = new Date(`${data.date}T00:00:00+07:00`).toLocaleDateString(
		"en-ID",
		{ weekday: "short", day: "2-digit", month: "short", year: "numeric" },
	);

	return (
		<>
			<PageHeader
				title="Dashboard"
				description={`${dateLabel} · Asia/Jakarta`}
			/>

			<div className="grid gap-6">
				<KpiRow>
					<KpiCard
						label="Revenue"
						value={formatIDRCurrency(String(data.kpi.revenue.today))}
						delta={data.kpi.revenue}
						comparisonLabel="vs yesterday"
					/>
					<KpiCard
						label="Orders in"
						value={numberFormatter.format(data.kpi.orders_in.today)}
						delta={data.kpi.orders_in}
						comparisonLabel="vs yesterday"
					/>
					<KpiCard
						label="Orders out"
						value={numberFormatter.format(data.kpi.orders_out.today)}
						delta={data.kpi.orders_out}
						comparisonLabel="vs yesterday"
					/>
					<KpiCard
						label="Queue depth"
						value={numberFormatter.format(data.kpi.queue_depth.today)}
						delta={data.kpi.queue_depth}
						comparisonLabel="vs yesterday"
					/>
				</KpiRow>

				<div className="grid gap-3">
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						Per store · today
					</p>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
						{data.per_store_today.map((store) => (
							<PerStoreCard
								key={store.store_id}
								store={store}
								maxRevenue={maxRevenue}
							/>
						))}
					</div>
				</div>

				<div className="grid gap-3 xl:grid-cols-2">
					<TopServicesCard services={data.top_services_week} />
					<RiskStrip risks={data.risks} />
				</div>
			</div>
		</>
	);
};

export const Route = createFileRoute("/_admin/")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(dashboardOverviewQueryOptions()),
	component: DashboardPage,
});
