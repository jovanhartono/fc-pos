import { createFileRoute, useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { DailyReport } from "@/features/reports/components/daily-report";
import {
	dailyReportQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";

const reportsSearchSchema = z.object({
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.catch(() => dayjs().format("YYYY-MM-DD")),
	store_id: z.coerce.number().int().positive().optional().catch(undefined),
});

export const Route = createFileRoute("/_admin/reports")({
	validateSearch: (search) => reportsSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		Promise.all([
			context.queryClient.ensureQueryData(
				dailyReportQueryOptions({
					date: deps.date,
					store_id: deps.store_id,
				}),
			),
			context.queryClient.ensureQueryData(storesQueryOptions()),
		]),
	component: ReportsPage,
});

function ReportsPage() {
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();

	return (
		<>
			<PageHeader
				title="Daily Report"
				description="Today's revenue, throughput, and order flow."
			/>
			<DailyReport
				date={search.date}
				storeId={search.store_id}
				onDateChange={(date) => {
					void navigate({
						search: (prev) => ({ ...prev, date }),
					});
				}}
				onStoreChange={(storeId) => {
					void navigate({
						search: (prev) => ({ ...prev, store_id: storeId }),
					});
				}}
			/>
		</>
	);
}
