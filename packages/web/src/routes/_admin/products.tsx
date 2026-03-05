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
	ProductForm,
	type ProductFormState,
} from "@/features/products/components/product-form";
import {
	createProduct,
	fetchProducts,
	type Product,
	queryKeys,
	updateProduct,
} from "@/lib/api";
import { formatIDRCurrency } from "@/shared/utils";
import { useGlobalSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/products")({
	component: ProductsPage,
});

function ProductsPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useGlobalSheet();

	const { data: products = [], isPending } = useQuery({
		queryKey: queryKeys.products,
		queryFn: fetchProducts,
	});
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
				description: `Editing ID ${product.id}`,
				content: (
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
			description: "Create a new product",
			content: (
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
					<CardTitle>Product List</CardTitle>
					<div className="flex items-center gap-2">
						<Badge
							variant={isPending ? "secondary" : "outline"}
						>{`${productCount} items`}</Badge>
						<Button
							onClick={handleOpenCreateSheet}
							icon={<Plus className="size-4" weight="duotone" />}
						>
							Add Product
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<DataTable columns={columns} data={products} isLoading={isPending} />
				</CardContent>
			</Card>
		</div>
	);
}
