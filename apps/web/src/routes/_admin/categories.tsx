import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { ActiveBadge } from "@/components/active-badge";
import { DataTable } from "@/components/data-table";
import type {
	DataTableColumnDef,
	DataTableRow,
} from "@/components/data-table-features";
import { EditRowButton } from "@/components/edit-row-button";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
	type Category,
	categoriesKeys,
	categoriesQueries,
	createCategory,
	updateCategory,
} from "@/features/categories/api";
import {
	CategoryForm,
	type CategoryFormState,
} from "@/features/categories/components/category-form";
import { useSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/categories")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(categoriesQueries.list()),
	component: CategoriesPage,
	// Past a second, the page itself draws with skeleton rows.
	pendingComponent: CategoriesPage,
	codeSplitGroupings: [["component", "pendingComponent"]],
});

const CategoriesActions = ({ row }: { row: DataTableRow<Category> }) => {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();

	const updateMutation = useMutation({
		mutationKey: ["update-category"],
		mutationFn: ({
			id,
			payload,
		}: {
			id: number;
			payload: Parameters<typeof updateCategory>[1];
		}) => updateCategory(id, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: categoriesKeys.all });
			closeSheet();
		},
	});

	const handleOpenEditSheet = (category: Category) => {
		openSheet({
			title: "Edit category",
			description: `Editing ID ${category.id}`,
			content: () => (
				<CategoryForm
					defaultValues={{
						name: category.name,
						description: category.description ?? "",
						is_active: category.is_active,
						starts_after_cleaning: category.starts_after_cleaning,
					}}
					handleOnSubmit={async (values) => {
						await updateMutation.mutateAsync({
							id: category.id,
							payload: values,
						});
					}}
					isEditing
					onReset={closeSheet}
				/>
			),
		});
	};

	return <EditRowButton onClick={() => handleOpenEditSheet(row.original)} />;
};

const columns: DataTableColumnDef<Category>[] = [
	{
		accessorKey: "name",
		header: "Category",
		meta: { kind: "name", width: { percent: 24, minRem: 7 } },
	},
	{
		accessorKey: "description",
		header: "Description",
		meta: {
			kind: "text",
			width: { percent: 52, minRem: 10 },
			mobileCard: {
				slot: "subtitle",
				className: "line-clamp-2",
				omitWhenEmpty: true,
			},
		},
		cell: ({ row }) => row.original.description ?? "—",
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
		cell: ({ row }) => <CategoriesActions row={row} />,
	},
];

function CategoriesPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();

	const { data = [], isPending } = useQuery(categoriesQueries.list());

	const createMutation = useMutation({
		mutationKey: ["create-category"],
		mutationFn: createCategory,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: categoriesKeys.all });
			closeSheet();
		},
	});

	const handleOpenCreateSheet = useCallback(() => {
		openSheet({
			title: "Add category",
			description: "Create a new category",
			content: () => (
				<CategoryForm
					handleOnSubmit={async (values: CategoryFormState) => {
						await createMutation.mutateAsync(values);
					}}
					isEditing={false}
					onReset={closeSheet}
				/>
			),
		});
	}, [closeSheet, createMutation, openSheet]);

	return (
		<>
			<PageHeader
				title="Categories"
				count={isPending ? undefined : data.length}
				countNoun="category"
				countNounPlural="categories"
				actions={
					<Button
						onClick={handleOpenCreateSheet}
						icon={<HugeiconsIcon icon={Add01Icon} className="size-4" />}
					>
						Add category
					</Button>
				}
			/>
			<ListPanel>
				<DataTable
					columns={columns}
					data={data}
					isCardGrouped
					skeletonCardClassName="h-24"
					isLoading={isPending}
					sortable
					emptyMessage="No categories."
				/>
			</ListPanel>
		</>
	);
}
