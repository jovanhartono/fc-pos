import { PencilSimpleLineIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { useCallback } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	CategoryForm,
	type CategoryFormState,
} from "@/features/categories/components/category-form";
import {
	type Category,
	createCategory,
	fetchCategories,
	queryKeys,
	updateCategory,
} from "@/lib/api";
import { useGlobalSheet, useSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/categories")({
	component: CategoriesPage,
});

const CategoriesActions = ({ row }: { row: Row<Category> }) => {
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
			await queryClient.invalidateQueries({ queryKey: queryKeys.categories });
			closeSheet();
		},
	});

	const handleOpenEditSheet = (category: Category) => {
		openSheet({
			title: "Edit Category",
			description: `Editing ID ${category.id}`,
			content: (
				<CategoryForm
					defaultValues={{
						name: category.name,
						description: category.description ?? "",
						is_active: category.is_active,
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

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={() => handleOpenEditSheet(row.original)}
			icon={<PencilSimpleLineIcon className="size-4" weight="duotone" />}
		>
			Edit
		</Button>
	);
};

const columns: ColumnDef<Category>[] = [
	{
		accessorKey: "name",
		header: "Category",
	},
	{
		accessorKey: "description",
		header: "Description",
		cell: ({ row }) => row.original.description ?? "-",
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
		cell: ({ row }) => <CategoriesActions row={row} />,
	},
];

function CategoriesPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useGlobalSheet();

	const { data = [], isPending } = useQuery({
		queryKey: queryKeys.categories,
		queryFn: fetchCategories,
	});
	const categoryCount = data.length;

	const createMutation = useMutation({
		mutationKey: ["create-category"],
		mutationFn: createCategory,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.categories });
			await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
			closeSheet();
		},
	});

	const handleOpenCreateSheet = useCallback(() => {
		openSheet({
			title: "Add Category",
			description: "Create a new category",
			content: (
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
		<div className="grid gap-4">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<CardTitle>Category List</CardTitle>
					<div className="flex items-center gap-2">
						<Badge
							variant={isPending ? "secondary" : "outline"}
						>{`${categoryCount} items`}</Badge>
						<Button
							onClick={handleOpenCreateSheet}
							icon={<PlusIcon className="size-4" weight="duotone" />}
						>
							Add Category
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<DataTable columns={columns} data={data} isLoading={isPending} />
				</CardContent>
			</Card>
		</div>
	);
}
