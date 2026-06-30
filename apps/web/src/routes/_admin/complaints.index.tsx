import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { useMemo } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import { DebouncedSearchInput } from "@/components/debounced-search-input";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getComplaintOutcome } from "@/features/complaints/lib/format";
import type { ComplaintListItem, FetchComplaintsQuery } from "@/lib/api";
import { complaintsPageQueryOptions } from "@/lib/query-options";

const complaintsSearchSchema = z.object({
	page: z.coerce.number().int().positive().catch(1),
	search: z.string().trim().min(1).max(100).optional().catch(undefined),
});

type ComplaintsSearch = z.infer<typeof complaintsSearchSchema>;

const PAGE_SIZE = 25;

function buildComplaintsListParams(
	search: ComplaintsSearch,
): FetchComplaintsQuery {
	return {
		limit: PAGE_SIZE,
		offset: (search.page - 1) * PAGE_SIZE,
		...(search.search ? { search: search.search } : {}),
	};
}

const ComplaintsPage = () => {
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();

	const complaintsQuery = useQuery(
		complaintsPageQueryOptions(buildComplaintsListParams(search)),
	);
	const complaints = complaintsQuery.data?.items ?? [];

	const handleSearchChange = (next: string) => {
		void navigate({
			search: (prev) => ({
				...prev,
				page: 1,
				search: next || undefined,
			}),
		});
	};

	const columns = useMemo<ColumnDef<ComplaintListItem>[]>(
		() => [
			{
				id: "complaint",
				header: "Complaint",
				meta: { mobileCard: { slot: "title" } },
				cell: ({ row }) => (
					<div className="flex flex-col gap-0.5">
						<Link
							to="/complaints/$complaintId"
							params={{ complaintId: String(row.original.id) }}
							className="font-mono font-semibold"
						>
							{row.original.order_code}
						</Link>
						<span className="text-[11px] text-muted-foreground">
							{row.original.service_name ?? "—"}
						</span>
					</div>
				),
			},
			{
				accessorKey: "customer_name",
				header: "Customer",
				meta: { mobileCard: { label: "Customer" } },
			},
			{
				accessorKey: "store_name",
				header: "Store",
				meta: { mobileCard: { slot: "eyebrow" } },
			},
			{
				id: "outcome",
				header: "Outcome",
				meta: { mobileCard: { slot: "badges" } },
				cell: ({ row }) => {
					const outcome = getComplaintOutcome({
						refunded: row.original.subject_status === "refunded",
						reworkCount: row.original.rework_count,
					});
					return <Badge variant={outcome.variant}>{outcome.label}</Badge>;
				},
			},
			{
				id: "opened",
				header: () => <div className="text-right">Opened</div>,
				meta: { mobileCard: { slot: "footer" } },
				cell: ({ row }) => (
					<div className="text-right text-muted-foreground tabular-nums">
						{dayjs(row.original.created_at).format("DD MMM HH:mm")}
					</div>
				),
			},
		],
		[],
	);

	return (
		<>
			<PageHeader title="Complaints" />
			<div className="grid gap-4">
				<Card>
					<CardContent>
						<DebouncedSearchInput
							id="complaints-search"
							value={search.search ?? ""}
							onDebouncedChange={handleSearchChange}
							placeholder="Search order code or customer…"
							ariaLabel="Search complaints"
						/>
						<div className="mt-4 grid gap-4">
							<DataTable
								columns={columns}
								data={complaints}
								isLoading={complaintsQuery.isPending}
							/>
							<TablePagination
								meta={complaintsQuery.data?.meta}
								isLoading={complaintsQuery.isPending}
								onPageChange={(page) => {
									void navigate({
										search: (prev) => ({ ...prev, page }),
									});
								}}
							/>
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
};

export const Route = createFileRoute("/_admin/complaints/")({
	validateSearch: (search) => complaintsSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		await context.queryClient.ensureQueryData(
			complaintsPageQueryOptions(buildComplaintsListParams(deps)),
		);
	},
	component: ComplaintsPage,
});
