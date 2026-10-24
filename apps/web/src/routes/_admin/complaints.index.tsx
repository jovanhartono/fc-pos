import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { DebouncedSearchInput } from "@/components/debounced-search-input";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import {
	type ComplaintListItem,
	complaintsQueries,
	type FetchComplaintsQuery,
} from "@/features/complaints/api";
import {
	formatComplaintItem,
	getComplaintItemName,
	getComplaintItemTag,
	getComplaintOutcome,
} from "@/features/complaints/lib/format";
import { CustomerLink } from "@/features/customers/components/customer-link";
import { OrderListRow } from "@/features/orders/components/order-list-row";
import { formatListDate } from "@/lib/dayjs";
import {
	DEFAULT_PAGE_SIZE,
	pageSizeChange,
	pageSizeSearch,
} from "@/lib/page-size";

const complaintsSearchSchema = z.object({
	page: z.coerce.number().int().positive().catch(1),
	limit: pageSizeSearch,
	search: z.string().trim().min(1).max(100).optional().catch(undefined),
});

type ComplaintsSearch = z.infer<typeof complaintsSearchSchema>;

function buildComplaintsListParams(
	search: ComplaintsSearch,
): FetchComplaintsQuery {
	const pageSize = search.limit ?? DEFAULT_PAGE_SIZE;
	return {
		limit: pageSize,
		offset: (search.page - 1) * pageSize,
		...(search.search ? { search: search.search } : {}),
	};
}

interface ComplaintOutcomeBadgeProps {
	complaint: ComplaintListItem;
}

const ComplaintOutcomeBadge = ({ complaint }: ComplaintOutcomeBadgeProps) => {
	const outcome = getComplaintOutcome({
		subjectStatus: complaint.subject_status,
		reworkCount: complaint.rework_count,
	});
	return <Badge variant={outcome.variant}>{outcome.label}</Badge>;
};

const ComplaintsPage = () => {
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();

	const complaintsQuery = useQuery({
		...complaintsQueries.list(buildComplaintsListParams(search)),
		placeholderData: keepPreviousData,
	});
	const complaints = complaintsQuery.data?.items ?? [];

	const handleSearchChange = (next: string) => {
		void navigate({
			replace: true,
			search: (prev) => ({
				...prev,
				page: 1,
				search: next || undefined,
			}),
		});
	};

	const columns = useMemo<DataTableColumnDef<ComplaintListItem>[]>(
		() => [
			{
				id: "complaint",
				header: "Complaint",
				meta: { width: { percent: 34, minRem: 10 } },
				cell: ({ row }) => (
					<div className="flex flex-col gap-0.5">
						<Link
							to="/complaints/$complaintId"
							params={{ complaintId: String(row.original.id) }}
							className="font-medium tabular-nums"
						>
							{row.original.order_code}
						</Link>
						<span className="text-subhead">
							{formatComplaintItem(row.original)}
						</span>
						<span className="text-subhead">
							{row.original.service_name ?? "—"}
						</span>
					</div>
				),
			},
			{
				accessorKey: "customer_name",
				header: "Customer",
				meta: { kind: "name", width: { percent: 22, minRem: 8.5 } },
				cell: ({ row }) => (
					<CustomerLink
						customerId={row.original.customer_id}
						name={row.original.customer_name}
					/>
				),
			},
			{
				accessorKey: "store_name",
				header: "Store",
				meta: { width: { percent: 18, minRem: 8 } },
			},
			{
				id: "outcome",
				header: "Outcome",
				meta: { width: { percent: 13, minRem: 6 } },
				cell: ({ row }) => <ComplaintOutcomeBadge complaint={row.original} />,
			},
			{
				id: "opened",
				header: () => <div className="text-right">Opened</div>,
				meta: { width: { percent: 13, minRem: 7 } },
				cell: ({ row }) => (
					<div className="whitespace-nowrap text-right text-muted-foreground tabular-nums">
						{formatListDate(row.original.created_at)}
					</div>
				),
			},
		],
		[],
	);

	return (
		<>
			<PageHeader
				count={complaintsQuery.data?.meta.total}
				countNoun="complaint"
				title="Complaints"
			/>
			<ListPanel>
				<DebouncedSearchInput
					id="complaints-search"
					value={search.search ?? ""}
					onDebouncedChange={handleSearchChange}
					placeholder="Search order code or customer"
					ariaLabel="Search complaints"
				/>
				<DataTable
					columns={columns}
					data={complaints}
					getRowLink={(complaint) => ({
						to: "/complaints/$complaintId",
						params: { complaintId: String(complaint.id) },
					})}
					isLoading={complaintsQuery.isPending}
					isStale={complaintsQuery.isPlaceholderData}
					filterKey={JSON.stringify(search)}
					renderCard={(complaint) => (
						<OrderListRow
							className="items-start rounded-none"
							hasCaret={false}
							details={[complaint.order_code, getComplaintItemTag(complaint)]}
							note={getComplaintItemName(complaint)}
							end={
								<div className="grid justify-items-end gap-1">
									<span className="whitespace-nowrap text-subhead tabular-nums">
										{formatListDate(complaint.created_at)}
									</span>
									<ComplaintOutcomeBadge complaint={complaint} />
								</div>
							}
							params={{ complaintId: String(complaint.id) }}
							title={complaint.customer_name}
							to="/complaints/$complaintId"
						/>
					)}
					footer={
						<TablePagination
							meta={complaintsQuery.data?.meta}
							isLoading={complaintsQuery.isPending}
							onPageChange={(page) => {
								void navigate({
									replace: true,
									search: (prev) => ({ ...prev, page }),
								});
							}}
							pageSize={search.limit ?? DEFAULT_PAGE_SIZE}
							onPageSizeChange={(limit) => {
								void navigate({
									replace: true,
									search: (prev) => ({ ...prev, ...pageSizeChange(limit) }),
								});
							}}
						/>
					}
				/>
			</ListPanel>
		</>
	);
};

export const Route = createFileRoute("/_admin/complaints/")({
	validateSearch: (search) => complaintsSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps, cause }) => {
		// Typing a search or paging keeps the page up and swaps the rows in place.
		if (cause === "stay") {
			return;
		}
		await context.queryClient.ensureQueryData(
			complaintsQueries.list(buildComplaintsListParams(deps)),
		);
	},
	component: ComplaintsPage,
	// Past a second, the page itself draws with skeleton rows.
	pendingComponent: ComplaintsPage,
	codeSplitGroupings: [["component", "pendingComponent"]],
});
