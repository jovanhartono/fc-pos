import { PencilSimpleLine, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	StoreForm,
	type StoreFormState,
} from "@/features/stores/components/store-form";
import {
	createStore,
	fetchStores,
	queryKeys,
	type Store,
	updateStore,
} from "@/lib/api";
import { useGlobalSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/stores")({
	component: StoresPage,
});

function StoresPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useGlobalSheet();

	const { data: stores = [], isPending } = useQuery({
		queryKey: queryKeys.stores,
		queryFn: fetchStores,
	});
	const storeCount = stores.length;

	const createMutation = useMutation({
		mutationKey: ["create-store"],
		mutationFn: createStore,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.stores });
			await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
			closeSheet();
		},
	});

	const updateMutation = useMutation({
		mutationKey: ["update-store"],
		mutationFn: ({
			id,
			payload,
		}: {
			id: number;
			payload: Parameters<typeof updateStore>[1];
		}) => updateStore(id, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.stores });
			closeSheet();
		},
	});

	const handleOpenEditSheet = useCallback(
		(store: Store) => {
			openSheet({
				title: "Edit Store",
				description: `Editing ID ${store.id}`,
				content: (
					<StoreForm
						defaultValues={{
							code: store.code,
							name: store.name,
							phone_number: store.phone_number,
							address: store.address,
							latitude: String(store.latitude),
							longitude: String(store.longitude),
							is_active: store.is_active,
						}}
						handleOnSubmit={async (values) => {
							await updateMutation.mutateAsync({
								id: store.id,
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
			title: "Add Store",
			description: "Create a new store",
			content: (
				<StoreForm
					handleOnSubmit={async (values: StoreFormState) => {
						await createMutation.mutateAsync(values);
					}}
					isEditing={false}
					onReset={closeSheet}
				/>
			),
		});
	}, [closeSheet, createMutation, openSheet]);

	const columns = useMemo<ColumnDef<Store>[]>(
		() => [
			{
				accessorKey: "code",
				header: "Code",
				cell: ({ row }) => (
					<span className="font-medium">{row.original.code}</span>
				),
			},
			{ accessorKey: "name", header: "Store" },
			{ accessorKey: "phone_number", header: "Phone" },
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
						icon={<PencilSimpleLine className="size-4" weight="duotone" />}
					>
						Edit
					</Button>
				),
			},
		],
		[handleOpenEditSheet],
	);

	return (
		<div className="grid gap-4">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<CardTitle>Store List</CardTitle>
					<div className="flex items-center gap-2">
						<Badge
							variant={isPending ? "secondary" : "outline"}
						>{`${storeCount} items`}</Badge>
						<Button
							onClick={handleOpenCreateSheet}
							icon={<Plus className="size-4" weight="duotone" />}
						>
							Add Store
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<DataTable columns={columns} data={stores} isLoading={isPending} />
				</CardContent>
			</Card>
		</div>
	);
}
