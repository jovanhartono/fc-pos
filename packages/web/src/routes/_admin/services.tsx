import { PencilSimpleLineIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	ServiceForm,
	type ServiceFormState,
} from "@/features/services/components/service-form";
import {
	createService,
	queryKeys,
	type Service,
	updateService,
} from "@/lib/api";
import { servicesQueryOptions } from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";
import { useSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/services")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(servicesQueryOptions()),
	component: ServicesPage,
});

function ServicesPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();

	const { data: services = [], isPending } = useQuery(servicesQueryOptions());
	const serviceCount = services.length;

	const createMutation = useMutation({
		mutationKey: ["create-service"],
		mutationFn: createService,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.services });
			await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
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
			await queryClient.invalidateQueries({ queryKey: queryKeys.services });
			closeSheet();
		},
	});

	const handleOpenEditSheet = useCallback(
		(service: Service) => {
			openSheet({
				title: "Edit Service",
				description: `Editing ID ${service.id}`,
				content: (
					<ServiceForm
						defaultValues={{
							category_id: service.category_id,
							code: service.code,
							cogs: String(service.cogs),
							price: String(service.price),
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
			title: "Add Service",
			description: "Create a new service",
			content: (
				<ServiceForm
					handleOnSubmit={async (values: ServiceFormState) => {
						await createMutation.mutateAsync(values);
					}}
					isEditing={false}
					onReset={closeSheet}
				/>
			),
		});
	}, [closeSheet, createMutation, openSheet]);

	const columns = useMemo<ColumnDef<Service>[]>(
		() => [
			{
				accessorKey: "code",
				header: "Code",
				cell: ({ row }) => (
					<span className="font-medium">{row.original.code}</span>
				),
			},
			{ accessorKey: "name", header: "Service" },
			{
				id: "category",
				header: "Category",
				cell: ({ row }) => row.original.category?.name ?? "-",
			},
			{
				accessorKey: "cogs",
				header: "COGS",
				cell: ({ row }) => formatIDRCurrency(String(row.original.cogs)),
			},
			{
				accessorKey: "price",
				header: "Price",
				cell: ({ row }) => formatIDRCurrency(String(row.original.price)),
			},
			{
				id: "priority",
				header: "Queue",
				cell: ({ row }) => (
					<Badge variant={row.original.is_priority ? "warning" : "outline"}>
						{row.original.is_priority ? "Priority" : "Standard"}
					</Badge>
				),
			},
			{
				id: "status",
				header: "Status",
				cell: ({ row }) => (
					<Badge variant={row.original.is_active ? "success" : "danger"}>
						{row.original.is_active ? "Active" : "Inactive"}
					</Badge>
				),
			},
			{
				id: "actions",
				header: "Actions",
				cell: ({ row }) => (
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleOpenEditSheet(row.original)}
						icon={<PencilSimpleLineIcon className="size-4" weight="duotone" />}
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
				title="Services"
				description="Insert and edit service master data."
				actions={
					<>
						<Badge
							variant={isPending ? "secondary" : "outline"}
						>{`${serviceCount} items`}</Badge>
						<Button
							onClick={handleOpenCreateSheet}
							icon={<PlusIcon className="size-4" weight="duotone" />}
						>
							Add Service
						</Button>
					</>
				}
			/>
			<div className="grid gap-4">
				<Card>
					<CardContent className="pt-6">
						<DataTable
							columns={columns}
							data={services}
							isLoading={isPending}
						/>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
