import { PlusIcon } from "@phosphor-icons/react";
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
				meta: { kind: "code", mobileCard: { slot: "subtitle" } },
			},
			{
				accessorKey: "name",
				header: "Service",
				meta: { kind: "name" },
			},
			{
				id: "category",
				header: "Category",
				meta: { mobileCard: { slot: "subtitle" } },
				cell: ({ row }) => row.original.category?.name ?? "-",
			},
			{
				accessorKey: "cogs",
				header: "COGS",
				meta: { align: "right" },
				cell: ({ row }) => formatMoney(String(row.original.cogs)),
			},
			{
				accessorKey: "price",
				header: "Price",
				meta: { align: "right" },
				cell: ({ row }) =>
					row.original.price === null ? (
						<span className="text-muted-foreground">No list price</span>
					) : (
						<MoneyValue value={row.original.price} />
					),
			},
			{
				id: "priority",
				header: "Queue",
				meta: { mobileCard: { slot: "status" } },
				cell: ({ row }) =>
					row.original.is_priority ? (
						<Badge variant="priority">Priority</Badge>
					) : null,
			},
			{
				id: "status",
				header: "Status",
				meta: { mobileCard: { slot: "status" } },
				cell: ({ row }) => <ActiveBadge isActive={row.original.is_active} />,
			},
			{
				id: "actions",
				header: "Actions",
				meta: { mobileCard: { slot: "title-end" } },
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
				actions={
					<Button
						onClick={handleOpenCreateSheet}
						icon={<PlusIcon className="size-4" />}
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
					isLoading={isPending}
					sortable
					cardPrimaryColumnId="name"
					emptyMessage="No services."
				/>
			</ListPanel>
		</>
	);
}
