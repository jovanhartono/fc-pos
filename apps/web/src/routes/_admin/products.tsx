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
import { MoneyValue } from "@/components/money-value";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
	createProduct,
	type Product,
	productsKeys,
	productsQueries,
	updateProduct,
} from "@/features/products/api";
import {
	ProductForm,
	type ProductFormState,
} from "@/features/products/components/product-form";
import { ProductStock } from "@/features/products/components/product-stock";
import { formatMoney } from "@/shared/money";
import { useSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/products")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(productsQueries.list()),
	component: ProductsPage,
	// Past a second, the page itself draws with skeleton rows.
	pendingComponent: ProductsPage,
	codeSplitGroupings: [["component", "pendingComponent"]],
});

function ProductsPage() {
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();

	const { data: products = [], isPending } = useQuery(productsQueries.list());

	const createMutation = useMutation({
		mutationKey: ["create-product"],
		mutationFn: createProduct,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: productsKeys.all });
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
			await queryClient.invalidateQueries({ queryKey: productsKeys.all });
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

	const columns = useMemo<DataTableColumnDef<Product>[]>(
		() => [
			{
				accessorKey: "sku",
				header: "SKU",
				meta: {
					kind: "code",
					width: { percent: 16, minRem: 9 },
					mobileCard: { slot: "subtitle" },
				},
			},
			{
				accessorKey: "name",
				header: "Product",
				meta: { kind: "name", width: { percent: 24, minRem: 9 } },
			},
			{
				id: "category",
				header: "Category",
				meta: {
					width: { percent: 13, minRem: 6.5 },
					mobileCard: { slot: "subtitle" },
				},
				cell: ({ row }) => row.original.category?.name ?? "-",
			},
			{
				accessorKey: "cogs",
				header: "COGS",
				meta: { align: "right", width: { percent: 10, minRem: 5.5 } },
				cell: ({ row }) => formatMoney(String(row.original.cogs)),
			},
			{
				accessorKey: "price",
				header: "Price",
				meta: { align: "right", width: { percent: 10, minRem: 5.5 } },
				cell: ({ row }) => <MoneyValue value={row.original.price} />,
			},
			{
				accessorKey: "stock",
				header: "Stock",
				meta: {
					align: "right",
					width: { percent: 9, minRem: 4.5 },
					mobileCard: { slot: "badges" },
				},
				cell: ({ row }) => <ProductStock stock={row.original.stock} />,
			},
			{
				id: "status",
				header: "Status",
				meta: {
					width: { percent: 9, minRem: 4.5 },
					mobileCard: { slot: "status" },
				},
				cell: ({ row }) => <ActiveBadge isActive={row.original.is_active} />,
			},
			{
				id: "actions",
				header: "Actions",
				meta: {
					width: { percent: 9, minRem: 4.5 },
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
				title="Products"
				count={isPending ? undefined : products.length}
				countNoun="product"
				actions={
					<Button
						onClick={handleOpenCreateSheet}
						icon={<HugeiconsIcon icon={Add01Icon} className="size-4" />}
					>
						Add Product
					</Button>
				}
			/>
			<ListPanel>
				<DataTable
					columns={columns}
					data={products}
					isCardGrouped
					skeletonCardClassName="h-33"
					isLoading={isPending}
					sortable
					cardPrimaryColumnId="name"
					emptyMessage="No products."
				/>
			</ListPanel>
		</>
	);
}
