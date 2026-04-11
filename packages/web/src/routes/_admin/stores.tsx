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
	StoreForm,
	type StoreFormState,
} from "@/features/stores/components/store-form";
import { createStore, queryKeys, type Store, updateStore } from "@/lib/api";
import { storesQueryOptions } from "@/lib/query-options";
import { useSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/stores")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(storesQueryOptions()),
	component: StoresPage,
});

function StoresPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();

	const { data: stores = [], isPending } = useQuery(storesQueryOptions());
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
				content: () => (
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
			content: () => (
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
				title="Stores"
				actions={
					<>
						<Badge
							variant={isPending ? "secondary" : "outline"}
						>{`${storeCount} items`}</Badge>
						<Button
							onClick={handleOpenCreateSheet}
							icon={<PlusIcon className="size-4" />}
						>
							Add Store
						</Button>
					</>
				}
			/>
			<div className="grid gap-4">
				<Card>
					<CardContent className="pt-6">
						<DataTable columns={columns} data={stores} isLoading={isPending} />
					</CardContent>
				</Card>
			</div>
		</>
	);
}
