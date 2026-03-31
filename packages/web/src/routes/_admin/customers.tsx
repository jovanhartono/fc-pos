import { PencilSimpleLineIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerSheetContent } from "@/features/customers/components/customer-sheet-content";
import type { Customer } from "@/lib/api";
import { customersPageQueryOptions } from "@/lib/query-options";
import { useSheet } from "@/stores/sheet-store";

const PAGE_SIZE = 25;

const customersSearchSchema = z.object({
	page: z.coerce.number().int().positive().catch(1),
});

export const Route = createFileRoute("/_admin/customers")({
	validateSearch: (search) => customersSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(
			customersPageQueryOptions({
				limit: PAGE_SIZE,
				offset: (deps.page - 1) * PAGE_SIZE,
			}),
		),
	component: CustomersPage,
});

function CustomersPage() {
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const { openSheet } = useSheet();

	const customersQuery = useQuery(
		customersPageQueryOptions({
			limit: PAGE_SIZE,
			offset: (search.page - 1) * PAGE_SIZE,
		}),
	);
	const customers = customersQuery.data?.items ?? [];
	const customerCount = customersQuery.data?.meta.total ?? 0;

	const handleOpenEditSheet = useCallback(
		(customer: Customer) => {
			openSheet({
				title: "Edit Customer",
				content: <CustomerSheetContent editingCustomer={customer} />,
			});
		},
		[openSheet],
	);

	const handleOpenCreateSheet = useCallback(() => {
		openSheet({
			title: "Add Customer",
			content: <CustomerSheetContent />,
		});
	}, [openSheet]);

	const columns = useMemo<ColumnDef<Customer>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Name",
			},
			{
				accessorKey: "phone_number",
				header: "Phone",
			},
			{
				accessorKey: "email",
				header: "Email",
				cell: ({ row }) => row.original.email ?? "-",
			},
			{
				id: "origin_store",
				header: "Origin Store",
				cell: ({ row }) => row.original.originStore?.name ?? "-",
			},
			{
				id: "actions",
				header: "Actions",
				cell: ({ row }) => (
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleOpenEditSheet(row.original)}
						icon={<PencilSimpleLineIcon className="size-4" />}
					>
						Edit
					</Button>
				),
			},
		],
		[handleOpenEditSheet],
	);

	return (
		<>
			<PageHeader
				title="Customers"
				actions={
					<>
						<Badge
							variant={customersQuery.isPending ? "secondary" : "outline"}
						>{`${customerCount} items`}</Badge>
						<Button
							onClick={handleOpenCreateSheet}
							icon={<PlusIcon className="size-4" />}
						>
							Add Customer
						</Button>
					</>
				}
			/>
			<div className="grid gap-4">
				<Card>
					<CardContent className="pt-6">
						<div className="grid gap-4">
							<DataTable
								columns={columns}
								data={customers}
								isLoading={customersQuery.isPending}
							/>
							<TablePagination
								meta={customersQuery.data?.meta}
								isLoading={customersQuery.isPending}
								onPageChange={(page) => {
									void navigate({
										search: (prev) => ({
											...prev,
											page,
										}),
									});
								}}
							/>
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
