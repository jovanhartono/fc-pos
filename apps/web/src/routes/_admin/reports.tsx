import type { QueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	type SearchSchemaInput,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import {
	QC_REJECTS_PREVIEW_SIZE,
	type ReportGranularity,
	reportsQueries,
} from "@/features/reports/api";
import { ExportSlotContext } from "@/features/reports/components/export-button";
import { ReportFilters } from "@/features/reports/components/report-filters";
import {
	ReportShell,
	type ReportTab,
} from "@/features/reports/components/report-shell";
// Bundled with the page rather than loaded per tab: a tab's first open used to
// blank the page under a placeholder while its code arrived.
import { AgingQueuePanel } from "@/features/reports/panels/aging-queue-panel";
import { CampaignsPanel } from "@/features/reports/panels/campaigns-panel";
import { CustomersPanel } from "@/features/reports/panels/customers-panel";
import { FinancialPanel } from "@/features/reports/panels/financial-panel";
import { OperationsPanel } from "@/features/reports/panels/operations-panel";
import { OverviewPanel } from "@/features/reports/panels/overview-panel";
import { PaymentsPanel } from "@/features/reports/panels/payments-panel";
import { QualityPanel } from "@/features/reports/panels/quality-panel";
import { WorkersPanel } from "@/features/reports/panels/workers-panel";
import {
	type ReportFilterValues,
	resetReportFilters,
	toReportFilters,
	withPresetRange,
	withSavedReportFilters,
} from "@/features/reports/utils/report-filters";
import { storesQueries } from "@/features/stores/api";
import { DATE_PRESETS, jakartaToday } from "@/shared/date-presets";
import { getCurrentUser } from "@/stores/auth-store";
import { useReportPreferencesStore } from "@/stores/report-preferences-store";

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
		preset: z.enum(DATE_PRESETS).optional().catch(undefined),
		from: z.string().regex(dateRegex).optional().catch(undefined),
		to: z.string().regex(dateRegex).optional().catch(undefined),
		store_id: z.coerce.number().int().positive().optional().catch(undefined),
		granularity: granularitySchema.catch(() => undefined),
	})
	.transform((value) => {
		const range = withPresetRange(value);
		if (range.from > range.to) {
			return { ...range, from: range.to };
		}
		return range;
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
					trend_days: 7,
				}),
			);
		case "financial":
			return queryClient.ensureQueryData(reportsQueries.financial(range));
		case "operations":
			return Promise.all([
				queryClient.ensureQueryData(reportsQueries.ordersFlow(range)),
				queryClient.ensureQueryData(reportsQueries.turnaround(range)),
			]);
		case "payments":
			return queryClient.ensureQueryData(reportsQueries.paymentMix(range));
		case "customers":
			return queryClient.ensureQueryData(
				reportsQueries.customerAcquisition(range),
			);
		case "quality": {
			const qualityRange = {
				from: search.from,
				to: search.to,
				store_id: search.store_id,
			};
			return Promise.all([
				queryClient.ensureQueryData(reportsQueries.quality(qualityRange)),
				queryClient.ensureQueryData(
					reportsQueries.qcRejects({
						...qualityRange,
						limit: QC_REJECTS_PREVIEW_SIZE,
						offset: 0,
					}),
				),
			]);
		}
		case "workers":
			return queryClient.ensureQueryData(
				reportsQueries.workerProductivity({
					from: search.from,
					to: search.to,
					store_id: search.store_id,
				}),
			);
		case "campaigns":
			return queryClient.ensureQueryData(
				reportsQueries.campaignEffectiveness(range),
			);
		case "aging-queue":
			return queryClient.ensureQueryData(
				reportsQueries.agingQueue({
					store_id: search.store_id,
					limit: 50,
					offset: 0,
				}),
			);
		default:
			return Promise.resolve();
	}
}

const descriptions: Record<Tab, string> = {
	overview: "Today's revenue, throughput, and order flow.",
	// One line on a phone like the rest, so switching tabs never moves the strip.
	financial: "Sales, revenue, COGS, margin and stores",
	operations: "Dropoff and pickup volume over time",
	payments: "Collected share per payment method",
	customers: "Acquisition and retention trends",
	quality: "QC rejects, first-pass rate and Complaints",
	workers: "Services processed per worker and day worked",
	campaigns: "Orders, collected, and discount cost per campaign",
	"aging-queue": "Items still in queue, oldest first",
};

function ReportsPage() {
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const setFilters = useReportPreferencesStore((state) => state.setFilters);
	const [exportSlot, setExportSlot] = useState<HTMLDivElement | null>(null);

	const currentTab = search.tab as Tab;

	// Saved only here, when the admin changes a filter, so opening an old link
	// or reloading never overwrites what they chose.
	const handleFiltersChange = (change: ReportFilterValues) => {
		void navigate({
			replace: true,
			// A Store picked from a table header far down the page keeps the
			// owner where they were reading.
			resetScroll: false,
			search: (prev) => {
				const filters = toReportFilters({ ...prev, ...change });
				const currentUser = getCurrentUser();
				if (currentUser) {
					setFilters(String(currentUser.id), filters);
				}
				return { tab: prev.tab, ...filters };
			},
		});
	};

	const showRangeFilters =
		currentTab !== "overview" && currentTab !== "aging-queue";
	const showGranularity =
		currentTab !== "overview" &&
		currentTab !== "aging-queue" &&
		currentTab !== "quality" &&
		currentTab !== "workers";

	return (
		<ExportSlotContext.Provider value={exportSlot}>
			<PageHeader
				title="Reports"
				description={descriptions[currentTab]}
				actions={
					<>
						<ReportFilters
							from={search.from}
							to={search.to}
							preset={search.preset}
							onRangeChange={handleFiltersChange}
							storeId={search.store_id}
							onStoreChange={(storeId) =>
								handleFiltersChange({ store_id: storeId })
							}
							granularity={search.granularity}
							onGranularityChange={(
								granularity: ReportGranularity | undefined,
							) => handleFiltersChange({ granularity })}
							onReset={() =>
								handleFiltersChange(resetReportFilters(showRangeFilters))
							}
							showRangeFilters={showRangeFilters}
							showGranularity={showGranularity}
						/>
						{/* Held open on every tab, even those without an Export, so
						    the filter button beside it never slides. */}
						<div
							ref={setExportSlot}
							className="flex w-9 shrink-0 pointer-coarse:w-11"
						/>
					</>
				}
			/>
			<ReportShell
				tabs={tabs}
				activeTab={currentTab}
				onTabChange={(tab) => {
					void navigate({
						replace: true,
						search: (prev) => ({ ...prev, tab: tab as Tab }),
					});
				}}
			>
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
					/>
				)}
				{currentTab === "workers" && (
					<WorkersPanel
						from={search.from}
						to={search.to}
						storeId={search.store_id}
						onStoreChange={(storeId) =>
							handleFiltersChange({ store_id: storeId })
						}
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
					// A new Store starts again on its first page.
					<AgingQueuePanel key={search.store_id} storeId={search.store_id} />
				)}
			</ReportShell>
		</ExportSlotContext.Provider>
	);
}

export const Route = createFileRoute("/_admin/reports")({
	// Restored before the loader runs, so an admin coming back from the sidebar
	// waits for their own range once instead of the 30-day default first.
	validateSearch: (
		search: ReportFilterValues & { tab?: Tab } & SearchSchemaInput,
	) => {
		const currentUser = getCurrentUser();
		const saved = currentUser
			? useReportPreferencesStore.getState().filtersByUser[
					String(currentUser.id)
				]
			: undefined;
		return reportsSearchSchema.parse(withSavedReportFilters(search, saved));
	},
	loaderDeps: ({ search }) => search,
	// A new tab or filter never waits here: the admin keeps the page they were
	// reading, faded, until the new numbers land in place.
	loader: async ({ context, deps, cause }) => {
		if (cause === "stay") {
			// A failed fetch is shown by the panel itself.
			prefetchForTab(context.queryClient, deps).catch(() => undefined);
			return;
		}
		await Promise.all([
			context.queryClient.ensureQueryData(storesQueries.list()),
			prefetchForTab(context.queryClient, deps),
		]);
	},
	component: ReportsPage,
	pendingComponent: ReportsPage,
	codeSplitGroupings: [["component", "pendingComponent"]],
});
