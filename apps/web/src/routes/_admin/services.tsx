import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { ActiveBadge } from "@/components/active-badge";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { EditRowButton } from "@/components/edit-row-button";
import { ListPanel } from "@/components/list-panel";
import { MoneyValue } from "@/components/money-value";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	createService,
	type Service,
	servicesKeys,
	servicesQueries,
	updateService,
} from "@/features/services/api";
import {
	ServiceForm,
	type ServiceFormSubmitValues,
} from "@/features/services/components/service-form";
import { formatMoney } from "@/shared/money";
import { useSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/services")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(servicesQueries.list()),
	component: ServicesPage,
	// Past a second, the page itself draws with skeleton rows.
	pendingComponent: ServicesPage,
	codeSplitGroupings: [["component", "pendingComponent"]],
});

function ServicesPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();

	const { data: services = [], isPending } = useQuery(servicesQueries.list());

	const createMutation = useMutation({
		mutationKey: ["create-service"],
		mutationFn: createService,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: servicesKeys.all });
			closeSheet();
		},
	});

	const updateMutation = useMutation({
		mutationKey: ["update-service"],
		mutationFn: ({
			id,
			payload,
		}: {
			id: number;
			payload: Parameters<typeof updateService>[1];
		}) => updateService(id, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: servicesKeys.all });
			closeSheet();
		},
	});

	const handleOpenEditSheet = useCallback(
		(service: Service) => {
			openSheet({
				title: "Edit service",
				content: () => (
					<ServiceForm
						defaultValues={{
							category_id: service.category_id,
							code: service.code,
							cogs: String(service.cogs),
							// null = no list price (Repair, ADR-0018)
							no_list_price: service.price === null,
							price: service.price === null ? "" : String(service.price),
							name: service.name,
							description: service.description ?? "",
							is_active: service.is_active,
							is_priority: service.is_priority,
						}}
						handleOnSubmit={async (values) => {
							await updateMutation.mutateAsync({
								id: service.id,
								payload: values,
							});
						}}
						isEditing
						onReset={closeSheet}
					/>
				),
			});
		},
		[closeSheet, openSheet, updateMutation],
	);

	const handleOpenCreateSheet = useCallback(() => {
		openSheet({
			title: "Add service",
			content: () => (
				<ServiceForm
					handleOnSubmit={async (values: ServiceFormSubmitValues) => {
						await createMutation.mutateAsync(values);
					}}
					isEditing={false}
					onReset={closeSheet}
				/>
			),
		});
	}, [closeSheet, createMutation, openSheet]);

	const columns = useMemo<DataTableColumnDef<Service>[]>(
		() => [
			{
				accessorKey: "code",
				header: "Code",
				meta: {
					kind: "code",
					width: { percent: 8, minRem: 4.5 },
					mobileCard: { slot: "subtitle" },
				},
			},
			{
				accessorKey: "name",
				header: "Service",
				meta: { kind: "name", width: { percent: 32, minRem: 9 } },
			},
			{
				id: "category",
				header: "Category",
				meta: {
					width: { percent: 11, minRem: 6.25 },
					mobileCard: { slot: "subtitle" },
				},
				cell: ({ row }) => row.original.category?.name ?? "-",
			},
			{
				accessorKey: "cogs",
				header: "COGS",
				meta: { align: "right", width: { percent: 11, minRem: 5.75 } },
				cell: ({ row }) => formatMoney(String(row.original.cogs)),
			},
			{
				accessorKey: "price",
				header: "Price",
				meta: { align: "right", width: { percent: 11, minRem: 6.25 } },
				cell: ({ row }) =>
					row.original.price === null ? (
						<span className="text-muted-foreground">No list price</span>
					) : (
						<MoneyValue value={row.original.price} />
					),
			},
			{
				id: "status",
				header: "Status",
				meta: {
					width: { percent: 18, minRem: 9.5 },
					mobileCard: { slot: "status" },
				},
				cell: ({ row }) => (
					<span className="flex items-center gap-1.5">
						{row.original.is_priority ? (
							<Badge variant="priority">Priority</Badge>
						) : (
							<Badge variant="outline">Standard</Badge>
						)}
						<ActiveBadge isActive={row.original.is_active} />
					</span>
				),
			},
			{
				id: "actions",
				header: "Actions",
				meta: {
					width: { percent: 9, minRem: 4.5 },
					mobileCard: { slot: "title-end" },
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
				title="Services"
				count={isPending ? undefined : services.length}
				countNoun="service"
				actions={
					<Button
						onClick={handleOpenCreateSheet}
						icon={<HugeiconsIcon icon={Add01Icon} className="size-4" />}
					>
						Add service
					</Button>
				}
			/>
			<ListPanel>
				<DataTable
					columns={columns}
					data={services}
					isCardGrouped
					skeletonCardClassName="h-32.5"
					isLoading={isPending}
					sortable
					cardPrimaryColumnId="name"
					emptyMessage="No services."
				/>
			</ListPanel>
		</>
	);
}
