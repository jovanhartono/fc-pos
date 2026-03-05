import { POSTOrderSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	OrderForm,
	type OrderFormState,
} from "@/features/orders/components/order-form";
import { createOrder, fetchOrders, type Order, queryKeys } from "@/lib/api";
import { normalizePhoneNumber } from "@/lib/phone-number";
import { useGlobalSheet } from "@/stores/sheet-store";

export const Route = createFileRoute("/_admin/orders")({
	component: OrdersPage,
});

const defaultForm: OrderFormState = {
	customer_name: "",
	customer_phone: "",
	customer_id: "",
	store_id: "",
	payment_method_id: "",
	payment_status: "unpaid",
	discount: "0",
	notes: "",
	product_id: "",
	product_qty: "1",
	service_id: "",
	service_qty: "1",
};

function toOrderPayload(values: OrderFormState) {
	return {
		customer_name: values.customer_name || undefined,
		customer_phone: normalizePhoneNumber(values.customer_phone) || undefined,
		customer_id: Number(values.customer_id),
		store_id: Number(values.store_id),
		products: values.product_id
			? [
					{
						id: Number(values.product_id),
						qty: Number(values.product_qty),
						notes: undefined,
					},
				]
			: undefined,
		services: values.service_id
			? [
					{
						id: Number(values.service_id),
						qty: Number(values.service_qty),
						notes: undefined,
					},
				]
			: undefined,
		discount: values.discount,
		payment_method_id: values.payment_method_id
			? Number(values.payment_method_id)
			: undefined,
		payment_status: values.payment_status,
		notes: values.notes || undefined,
	};
}

const orderFormResolverSchema = z
	.object({
		customer_name: z.string(),
		customer_phone: z.string(),
		customer_id: z.string(),
		store_id: z.string(),
		payment_method_id: z.string(),
		payment_status: z.enum(["paid", "partial", "unpaid"]),
		discount: z.string(),
		notes: z.string(),
		product_id: z.string(),
		product_qty: z.string(),
		service_id: z.string(),
		service_qty: z.string(),
	})
	.superRefine((values, ctx) => {
		const parsed = POSTOrderSchema.safeParse(toOrderPayload(values));
		if (parsed.success) {
			return;
		}

		for (const issue of parsed.error.issues) {
			const issuePath = String(issue.path[0] ?? "");
			let path = issue.path;
			if (issuePath === "products_ids") {
				path = ["product_id"];
			}
			if (issuePath === "services_ids") {
				path = ["service_id"];
			}
			ctx.addIssue({
				code: "custom",
				path,
				message: issue.message,
			});
		}
	});

function CreateOrderSheetContent() {
	const queryClient = useQueryClient();
	const { closeSheet } = useGlobalSheet();

	const form = useForm<OrderFormState>({
		resolver: zodResolver(orderFormResolverSchema, undefined, {
			raw: true,
		}) as any,
		defaultValues: defaultForm,
	});

	const createMutation = useMutation({
		mutationKey: ["create-order"],
		mutationFn: createOrder,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.orders });
			await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
			form.reset(defaultForm);
			closeSheet();
		},
	});

	const handleSubmit: SubmitHandler<OrderFormState> = async (values) => {
		const payload = toOrderPayload(values);

		await createMutation.mutateAsync(payload);
	};

	return (
		<OrderForm
			control={form.control}
			handleSubmit={form.handleSubmit}
			onSubmit={handleSubmit}
			isSubmitting={createMutation.isPending}
		/>
	);
}

function OrdersPage() {
	const { openSheet } = useGlobalSheet();

	const { data: orders = [], isPending } = useQuery({
		queryKey: queryKeys.orders,
		queryFn: fetchOrders,
	});
	const orderCount = orders.length;

	const columns = useMemo<ColumnDef<Order>[]>(
		() => [
			{ accessorKey: "id", header: "Order ID" },
			{ accessorKey: "customer_name", header: "Customer" },
			{ accessorKey: "customer_phone", header: "Phone" },
			{
				accessorKey: "payment_status",
				header: "Payment",
				cell: ({ row }) => (
					<Badge
						variant={
							row.original.payment_status === "paid" ? "secondary" : "outline"
						}
					>
						{row.original.payment_status}
					</Badge>
				),
			},
			{ accessorKey: "store_id", header: "Store" },
		],
		[],
	);

	const handleAddOrder = () => {
		openSheet({
			title: "Create Order",
			description: "Create a new order from products/services.",
			content: <CreateOrderSheetContent />,
		});
	};

	return (
		<div className="grid gap-4">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<CardTitle>Order List</CardTitle>
					<div className="flex items-center gap-2">
						<Badge
							variant={isPending ? "secondary" : "outline"}
						>{`${orderCount} items`}</Badge>
						<Button
							onClick={handleAddOrder}
							icon={<Plus className="size-4" weight="duotone" />}
						>
							Add Order
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<DataTable columns={columns} data={orders} isLoading={isPending} />
				</CardContent>
			</Card>
		</div>
	);
}
