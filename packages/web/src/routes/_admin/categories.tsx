import { PencilSimpleLineIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { useCallback } from "react";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	CategoryForm,
	type CategoryFormState,
} from "@/features/categories/components/category-form";
import {
	type Category,
	createCategory,
	queryKeys,
	updateCategory,
} from "@/lib/api";
import { categoriesQueryOptions } from "@/lib/query-options";
import { useSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/categories")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(categoriesQueryOptions()),
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
	const { openSheet, closeSheet } = useSheet();

	const { data = [], isPending } = useQuery(categoriesQueryOptions());
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
		<>
			<PageHeader
				title="Categories"
				actions={
					<>
						<Badge
							variant={isPending ? "secondary" : "outline"}
						>{`${categoryCount} items`}</Badge>
						<Button
							onClick={handleOpenCreateSheet}
							icon={<PlusIcon className="size-4" weight="duotone" />}
						>
							Add Category
						</Button>
					</>
				}
			/>
			<div className="grid gap-4">
				<Card>
					<CardContent className="pt-6">
						<DataTable columns={columns} data={data} isLoading={isPending} />
					</CardContent>
				</Card>
			</div>
		</>
	);
}
