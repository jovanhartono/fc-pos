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
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
	createStore,
	type Store,
	storesKeys,
	storesQueries,
	updateStore,
} from "@/features/stores/api";
import {
	StoreForm,
	type StoreFormState,
} from "@/features/stores/components/store-form";
import { useSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/stores")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(storesQueries.list()),
	component: StoresPage,
	// Past a second, the page itself draws with skeleton rows.
	pendingComponent: StoresPage,
	codeSplitGroupings: [["component", "pendingComponent"]],
});

function StoresPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();

	const { data: stores = [], isPending } = useQuery(storesQueries.list());

	const createMutation = useMutation({
		mutationKey: ["create-store"],
		mutationFn: createStore,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: storesKeys.all });
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
			await queryClient.invalidateQueries({ queryKey: storesKeys.all });
			closeSheet();
		},
	});

	const handleOpenEditSheet = useCallback(
		(store: Store) => {
			openSheet({
				title: "Edit store",
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
			title: "Add store",
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

	const columns = useMemo<DataTableColumnDef<Store>[]>(
		() => [
			{
				accessorKey: "code",
				header: "Code",
				meta: { kind: "code", width: { percent: 14, minRem: 4.5 } },
			},
			{
				accessorKey: "name",
				header: "Store",
				meta: { kind: "name", width: { percent: 40, minRem: 8.5 } },
			},
			{
				accessorKey: "phone_number",
				header: "Phone",
				meta: { width: { percent: 22, minRem: 7 } },
			},
			{
				id: "status",
				header: "Status",
				meta: {
					width: { percent: 12, minRem: 4.5 },
					mobileCard: { slot: "status" },
				},
				cell: ({ row }) => <ActiveBadge isActive={row.original.is_active} />,
			},
			{
				id: "actions",
				header: "Actions",
				meta: {
					width: { percent: 12, minRem: 4.5 },
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
				title="Stores"
				count={isPending ? undefined : stores.length}
				countNoun="store"
				actions={
					<Button
						onClick={handleOpenCreateSheet}
						icon={<HugeiconsIcon icon={Add01Icon} className="size-4" />}
					>
						Add store
					</Button>
				}
			/>
			<ListPanel>
				<DataTable
					columns={columns}
					data={stores}
					isCardGrouped
					skeletonCardClassName="h-19"
					isLoading={isPending}
					sortable
					cardPrimaryColumnId="name"
					emptyMessage="No stores."
				/>
			</ListPanel>
		</>
	);
}
