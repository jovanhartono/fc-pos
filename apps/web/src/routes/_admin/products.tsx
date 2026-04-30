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
	ProductForm,
	type ProductFormState,
} from "@/features/products/components/product-form";
import {
	createProduct,
	type Product,
	queryKeys,
	updateProduct,
} from "@/lib/api";
import { productsQueryOptions } from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";
import { useSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/products")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(productsQueryOptions()),
	component: ProductsPage,
});

function ProductsPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();

	const { data: products = [], isPending } = useQuery(productsQueryOptions());
	const productCount = products.length;

	const createMutation = useMutation({
		mutationKey: ["create-product"],
		mutationFn: createProduct,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.products });
			await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
			closeSheet();
		},
	});

	const updateMutation = useMutation({
		mutationKey: ["update-product"],
		mutationFn: ({
			id,
			payload,
		}: {
			id: number;
			payload: Parameters<typeof updateProduct>[1];
		}) => updateProduct(id, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.products });
			closeSheet();
		},
	});

	const handleOpenEditSheet = useCallback(
		(product: Product) => {
			openSheet({
				title: "Edit Product",
				content: () => (
					<ProductForm
						defaultValues={{
							name: product.name,
							description: product.description ?? "",
							is_active: product.is_active,
							sku: product.sku,
							uom: product.uom,
							stock: product.stock,
							category_id: product.category_id,
							cogs: String(product.cogs),
							price: String(product.price),
						}}
						handleOnSubmit={async (values) => {
							await updateMutation.mutateAsync({
								id: product.id,
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
			title: "Add Product",
			content: () => (
				<ProductForm
					handleOnSubmit={async (values: ProductFormState) => {
						await createMutation.mutateAsync(values);
					}}
					isEditing={false}
					onReset={closeSheet}
				/>
			),
		});
	}, [closeSheet, createMutation, openSheet]);

	const columns = useMemo<ColumnDef<Product>[]>(
		() => [
			{
				accessorKey: "sku",
				header: "SKU",
				cell: ({ row }) => (
					<span className="font-medium">{row.original.sku}</span>
				),
			},
			{ accessorKey: "name", header: "Product" },
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
			{ accessorKey: "stock", header: "Stock" },
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
				title="Products"
				actions={
					<>
						<Badge
							variant={isPending ? "secondary" : "outline"}
						>{`${productCount} items`}</Badge>
						<Button
							onClick={handleOpenCreateSheet}
							icon={<PlusIcon className="size-4" />}
						>
							Add Product
						</Button>
					</>
				}
			/>
			<div className="grid gap-4">
				<Card>
					<CardContent>
						<DataTable
							columns={columns}
							data={products}
							isLoading={isPending}
							sortable
							cardPrimaryColumnId="name"
						/>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
