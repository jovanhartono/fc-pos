import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { DebouncedSearchInput } from "@/components/debounced-search-input";
import { EditRowButton } from "@/components/edit-row-button";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { type Customer, customersQueries } from "@/features/customers/api";
import { CustomerSheetContent } from "@/features/customers/components/customer-sheet-content";
import {
	DEFAULT_PAGE_SIZE,
	pageSizeChange,
	pageSizeSearch,
} from "@/lib/page-size";
import { getCurrentUser } from "@/stores/auth-store";
import { useSheet } from "@/stores/sheet-store";

const customersSearchSchema = z.object({
	page: z.coerce.number().int().positive().catch(1),
	limit: pageSizeSearch,
	search: z.string().trim().min(1).max(100).optional(),
});

export const Route = createFileRoute("/_admin/customers/")({
	validateSearch: (search) => customersSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps, cause }) => {
		// Typing a search or paging keeps the page up, the search box focused,
		// and swaps the rows in place; only opening the page waits for them.
		if (cause === "stay") {
			return;
		}
		await context.queryClient.ensureQueryData(
			customersQueries.list({
				limit: deps.limit ?? DEFAULT_PAGE_SIZE,
				offset: (deps.page - 1) * (deps.limit ?? DEFAULT_PAGE_SIZE),
				...(deps.search ? { search: deps.search } : {}),
			}),
		);
	},
	component: CustomersPage,
	// Past a second, the page itself draws with skeleton rows.
	pendingComponent: CustomersPage,
	codeSplitGroupings: [["component", "pendingComponent"]],
});

function CustomersPage() {
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const pageSize = search.limit ?? DEFAULT_PAGE_SIZE;
	const { openSheet } = useSheet();
	// Same rule as CustomerLink: the detail page is admin-only (ADR-0021).
	const isAdmin = getCurrentUser()?.role === "admin";

	const handleSearchChange = useCallback(
		(next: string) => {
			void navigate({
				replace: true,
				search: (prev) => ({
					...prev,
					page: 1,
					search: next || undefined,
				}),
			});
		},
		[navigate],
	);

	const customersQuery = useQuery({
		...customersQueries.list({
			limit: pageSize,
			offset: (search.page - 1) * pageSize,
			...(search.search ? { search: search.search } : {}),
		}),
		placeholderData: keepPreviousData,
	});
	const customers = customersQuery.data?.items ?? [];

	const handleOpenEditSheet = useCallback(
		(customer: Customer) => {
			openSheet({
				title: "Edit customer",
				content: () => <CustomerSheetContent editingCustomer={customer} />,
			});
		},
		[openSheet],
	);

	const handleOpenCreateSheet = useCallback(() => {
		openSheet({
			title: "Add customer",
			content: () => <CustomerSheetContent />,
		});
	}, [openSheet]);

	const columns = useMemo<DataTableColumnDef<Customer>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Name",
				meta: { kind: "name", width: { percent: 31, minRem: 9 } },
				// On a phone, Edit sits right after the name; the table keeps its
				// Actions column.
				cell: ({ row }) => (
					<>
						{row.original.name}
						<span className="ml-2 inline-flex align-middle lg:hidden">
							<EditRowButton
								onClick={() => handleOpenEditSheet(row.original)}
							/>
						</span>
					</>
				),
			},
			{
				accessorKey: "phone_number",
				header: "Phone",
				meta: {
					width: { percent: 15, minRem: 7.5 },
					mobileCard: {
						slot: "subtitle",
						className: "text-foreground text-subhead tabular-nums",
					},
				},
			},
			{
				accessorKey: "email",
				header: "Email",
				meta: {
					kind: "text",
					width: { percent: 28, minRem: 10 },
					mobileCard: { slot: "hidden" },
				},
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{row.original.email ?? "—"}
					</span>
				),
			},
			{
				id: "origin_store",
				header: "Origin store",
				meta: {
					width: { percent: 18, minRem: 8.5 },
					mobileCard: {
						slot: "subtitle",
						className: "text-foreground text-subhead",
					},
				},
				cell: ({ row }) => row.original.originStore?.name ?? "—",
			},
			{
				id: "actions",
				header: "Actions",
				meta: {
					width: { percent: 8, minRem: 4.5 },
					mobileCard: { slot: "hidden" },
				},
				cell: ({ row }) => (
					<EditRowButton onClick={() => handleOpenEditSheet(row.original)} />
				),
			},
		],
		[handleOpenEditSheet],
	);

	return (
		<>
			<PageHeader
				title="Customers"
				count={customersQuery.data?.meta.total}
				countNoun="customer"
				actions={
					<Button
						onClick={handleOpenCreateSheet}
						icon={<HugeiconsIcon icon={Add01Icon} className="size-4" />}
					>
						Add customer
					</Button>
				}
			/>
			<ListPanel>
				<DebouncedSearchInput
					id="customers-search"
					value={search.search ?? ""}
					onDebouncedChange={handleSearchChange}
					placeholder="Search by name or phone"
					ariaLabel="Search customers"
					className="w-full sm:w-72"
				/>
				<DataTable
					columns={columns}
					data={customers}
					getRowLink={
						isAdmin
							? (customer) => ({
									to: "/customers/$customerId",
									params: { customerId: String(customer.id) },
									search: { page: 1 },
								})
							: undefined
					}
					isCardGrouped
					skeletonCardClassName="h-19"
					isLoading={customersQuery.isPending}
					isStale={customersQuery.isPlaceholderData}
					filterKey={JSON.stringify(search)}
					footer={
						<TablePagination
							meta={customersQuery.data?.meta}
							isLoading={customersQuery.isPending}
							onPageChange={(page) => {
								void navigate({
									replace: true,
									search: (prev) => ({
										...prev,
										page,
									}),
								});
							}}
							pageSize={pageSize}
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
}
