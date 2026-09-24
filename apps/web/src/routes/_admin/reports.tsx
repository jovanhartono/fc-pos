import type { QueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { lazy, type PropsWithChildren, Suspense, useEffect } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { type ReportGranularity, reportsQueries } from "@/features/reports/api";
import { ReportFilters } from "@/features/reports/components/report-filters";
import {
	ReportShell,
	type ReportTab,
} from "@/features/reports/components/report-shell";
import {
	defaultRange,
	toSavedReportFilters,
	withSavedReportFilters,
} from "@/features/reports/utils/report-filters";
import { storesQueries } from "@/features/stores/api";
import { jakartaToday } from "@/shared/date-presets";
import { getCurrentUser } from "@/stores/auth-store";
import { useReportPreferencesStore } from "@/stores/report-preferences-store";

const OverviewPanel = lazy(
	() => import("@/features/reports/panels/overview-panel"),
);
const FinancialPanel = lazy(
	() => import("@/features/reports/panels/financial-panel"),
);
const OperationsPanel = lazy(
	() => import("@/features/reports/panels/operations-panel"),
);
const PaymentsPanel = lazy(
	() => import("@/features/reports/panels/payments-panel"),
);
const CustomersPanel = lazy(
	() => import("@/features/reports/panels/customers-panel"),
);
const QualityPanel = lazy(
	() => import("@/features/reports/panels/quality-panel"),
);
const WorkersPanel = lazy(
	() => import("@/features/reports/panels/workers-panel"),
);
const CampaignsPanel = lazy(
	() => import("@/features/reports/panels/campaigns-panel"),
);
const AgingQueuePanel = lazy(
	() => import("@/features/reports/panels/aging-queue-panel"),
);

const tabs: ReportTab[] = [
	{ id: "overview", label: "Overview" },
	{ id: "financial", label: "Financial" },
	{ id: "operations", label: "Operations" },
	{ id: "payments", label: "Payments" },
	{ id: "customers", label: "Customers" },
	{ id: "quality", label: "Quality" },
	{ id: "workers", label: "Workers" },
	{ id: "campaigns", label: "Campaigns" },
	{ id: "aging-queue", label: "Aging Queue" },
];

const tabSchema = z.enum([
	"overview",
	"financial",
	"operations",
	"payments",
	"customers",
	"quality",
	"workers",
	"campaigns",
	"aging-queue",
]);

type Tab = z.infer<typeof tabSchema>;

const granularitySchema = z.enum(["day", "week", "month", "year"]).optional();

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const reportsSearchSchema = z
	.object({
		tab: tabSchema.catch(() => "overview" as const),
		from: z
			.string()
			.regex(dateRegex)
			.catch(() => defaultRange().from),
		to: z
			.string()
			.regex(dateRegex)
			.catch(() => defaultRange().to),
		store_id: z.coerce.number().int().positive().optional().catch(undefined),
		granularity: granularitySchema.catch(() => undefined),
	})
	.transform((value) => {
		if (value.from > value.to) {
			return { ...value, from: value.to };
		}
		return value;
	});

type ReportsSearch = z.infer<typeof reportsSearchSchema>;

function prefetchForTab(queryClient: QueryClient, search: ReportsSearch) {
	const range = {
		from: search.from,
		to: search.to,
		store_id: search.store_id,
		granularity: search.granularity,
	};
	switch (search.tab) {
		case "overview":
			return queryClient.ensureQueryData(
				reportsQueries.overview({
					date: jakartaToday(),
					store_id: search.store_id,
					trend_days: 14,
				}),
			);
		case "financial":
			return queryClient.ensureQueryData(reportsQueries.financial(range));
		case "operations":
			return queryClient.ensureQueryData(reportsQueries.ordersFlow(range));
		case "payments":
			return queryClient.ensureQueryData(reportsQueries.paymentMix(range));
		case "customers":
			return queryClient.ensureQueryData(
				reportsQueries.customerAcquisition(range),
			);
		case "quality":
			return queryClient.ensureQueryData(reportsQueries.refundTrend(range));
		case "workers":
			return queryClient.ensureQueryData(
				reportsQueries.workerProductivity(range),
			);
		case "campaigns":
			return queryClient.ensureQueryData(
				reportsQueries.campaignEffectiveness(range),
			);
		case "aging-queue":
			return queryClient.ensureQueryData(
				reportsQueries.agingQueue({ store_id: search.store_id, limit: 50 }),
			);
		default:
			return Promise.resolve();
	}
}

const PanelSkeleton = () => (
	<div className="grid gap-6">
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<div className="h-24 animate-pulse bg-muted/40" />
			<div className="h-24 animate-pulse bg-muted/40" />
			<div className="h-24 animate-pulse bg-muted/40" />
			<div className="h-24 animate-pulse bg-muted/40" />
		</div>
		<div className="h-[320px] animate-pulse bg-muted/40" />
		<div className="h-[320px] animate-pulse bg-muted/40" />
	</div>
);

const descriptions: Record<Tab, string> = {
	overview: "Today's revenue, throughput, and order flow.",
	financial: "Gross sales, revenue, COGS, margin, and store performance",
	operations: "Dropoff and pickup volume over time",
	payments: "Collected share per payment method",
	customers: "Acquisition and retention trends",
	quality: "Refund volume and root-cause mix",
	workers: "Services processed and shift productivity",
	campaigns: "Orders, collected, and discount cost per campaign",
	"aging-queue": "Items still in queue, oldest first",
};

// Shared with the pending state at the bottom of this file. Switching tabs
// re-runs the loader, and a manager on shop wifi was getting the whole page
// swapped for grey blocks — including the tab strip they had just tapped.
const ReportsChrome = ({ children }: PropsWithChildren) => {
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();

	const currentTab = search.tab as Tab;

	const showRangeFilters =
		currentTab !== "overview" && currentTab !== "aging-queue";
	const showGranularity =
		currentTab !== "overview" && currentTab !== "aging-queue";

	return (
		<>
			<PageHeader
				title="Reports"
				description={descriptions[currentTab]}
				actions={
					<ReportFilters
						from={search.from}
						to={search.to}
						onRangeChange={(range) => {
							void navigate({
								search: (prev) => ({
									...prev,
									from: range.from,
									to: range.to,
								}),
							});
						}}
						storeId={search.store_id}
						onStoreChange={(storeId) => {
							void navigate({
								search: (prev) => ({ ...prev, store_id: storeId }),
							});
						}}
						granularity={search.granularity}
						onGranularityChange={(
							granularity: ReportGranularity | undefined,
						) => {
							void navigate({
								search: (prev) => ({ ...prev, granularity }),
							});
						}}
						showRangeFilters={showRangeFilters}
						showGranularity={showGranularity}
					/>
				}
			/>
			<ReportShell
				tabs={tabs}
				activeTab={currentTab}
				onTabChange={(tab) => {
					void navigate({
						search: (prev) => ({ ...prev, tab: tab as Tab }),
					});
				}}
			>
				{children}
			</ReportShell>
		</>
	);
};

function ReportsPage() {
	const search = Route.useSearch();
	const currentTab = search.tab as Tab;
	const currentUser = getCurrentUser();
	const currentUserKey = currentUser ? String(currentUser.id) : "";

	useEffect(() => {
		if (!currentUserKey) {
			return;
		}
		const { filtersByUser, setFilters } = useReportPreferencesStore.getState();
		setFilters(
			currentUserKey,
			toSavedReportFilters(
				{
					from: search.from,
					to: search.to,
					store_id: search.store_id,
					granularity: search.granularity,
				},
				filtersByUser[currentUserKey],
			),
		);
	}, [
		currentUserKey,
		search.from,
		search.to,
		search.store_id,
		search.granularity,
	]);

	return (
		<ReportsChrome>
			<Suspense fallback={<PanelSkeleton />}>
				{currentTab === "overview" && (
					<OverviewPanel date={jakartaToday()} storeId={search.store_id} />
				)}
				{currentTab === "financial" && (
					<FinancialPanel
						from={search.from}
						to={search.to}
						storeId={search.store_id}
						granularity={search.granularity}
					/>
				)}
				{currentTab === "operations" && (
					<OperationsPanel
						from={search.from}
						to={search.to}
						storeId={search.store_id}
						granularity={search.granularity}
					/>
				)}
				{currentTab === "payments" && (
					<PaymentsPanel
						from={search.from}
						to={search.to}
						storeId={search.store_id}
						granularity={search.granularity}
					/>
				)}
				{currentTab === "customers" && (
					<CustomersPanel
						from={search.from}
						to={search.to}
						storeId={search.store_id}
						granularity={search.granularity}
					/>
				)}
				{currentTab === "quality" && (
					<QualityPanel
						from={search.from}
						to={search.to}
						storeId={search.store_id}
						granularity={search.granularity}
					/>
				)}
				{currentTab === "workers" && (
					<WorkersPanel
						from={search.from}
						to={search.to}
						storeId={search.store_id}
						granularity={search.granularity}
					/>
				)}
				{currentTab === "campaigns" && (
					<CampaignsPanel
						from={search.from}
						to={search.to}
						storeId={search.store_id}
						granularity={search.granularity}
					/>
				)}
				{currentTab === "aging-queue" && (
					<AgingQueuePanel storeId={search.store_id} />
				)}
			</Suspense>
		</ReportsChrome>
	);
}

const ReportsPending = () => (
	<ReportsChrome>
		<PanelSkeleton />
	</ReportsChrome>
);

export const Route = createFileRoute("/_admin/reports")({
	// Restored here rather than in the page, so the loader fetches the saved
	// range once instead of the default range first.
	validateSearch: (search) => {
		const currentUser = getCurrentUser();
		const saved = currentUser
			? useReportPreferencesStore.getState().filtersByUser[
					String(currentUser.id)
				]
			: undefined;
		return reportsSearchSchema.parse(withSavedReportFilters(search, saved));
	},
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		// A remembered Store can be gone since (a reseed renumbers them); reading
		// it anyway shows zeros under an "All stores" badge.
		if (deps.store_id !== undefined) {
			const stores = await context.queryClient.ensureQueryData(
				storesQueries.list(),
			);
			if (!stores.some((store) => store.id === deps.store_id)) {
				throw redirect({
					to: "/reports",
					search: { ...deps, store_id: undefined },
					replace: true,
				});
			}
		}
		await Promise.all([
			context.queryClient.ensureQueryData(storesQueries.list()),
			prefetchForTab(context.queryClient, deps),
		]);
	},
	component: ReportsPage,
	pendingComponent: ReportsPending,
});
