import { ArrowLeft, ShoppingCart } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { OrderForm } from "@/features/orders/components/order-form";
import { handleCreatedOrderSuccess } from "@/features/orders/lib/create-order-workflow";
import { type CreateOrderPayload, createOrder } from "@/lib/api";
import { currentUserDetailQueryOptions } from "@/lib/query-options";
import { getCurrentUser } from "@/stores/auth-store";

export const Route = createFileRoute("/_admin/orders/new")({
	loader: async ({ context }) => {
		const currentUser = getCurrentUser();

		if (!currentUser) {
			return;
		}

		await context.queryClient.ensureQueryData(
			currentUserDetailQueryOptions(currentUser.id),
		);
	},
	component: CreateOrderPage,
});

function CreateOrderPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const currentUser = getCurrentUser();

	const currentUserDetailQuery = useQuery({
		...currentUserDetailQueryOptions(currentUser?.id ?? -1),
		enabled: !!currentUser,
	});

	const userStoreIds =
		currentUserDetailQuery.data?.userStores?.map((item) => item.store_id) ?? [];
	const allowedStoreIds =
		currentUser?.role === "admin" ? undefined : userStoreIds;

	const createMutation = useMutation({
		mutationKey: ["create-order"],
		mutationFn: createOrder,
	});

	const handleOnSubmit = async (payload: CreateOrderPayload) => {
		const created = await createMutation.mutateAsync(payload);

		await handleCreatedOrderSuccess({
			created,
			queryClient,
			onFallbackNavigate: () => {
				void navigate({ to: "/orders", search: { page: 1 } });
			},
			onOrderDetailNavigate: (orderId) => {
				void navigate({
					to: "/orders/$orderId",
					params: { orderId: String(orderId) },
				});
			},
		});
	};

	return (
		<>
			<PageHeader
				title="Create Order"
				description="Create a new order from products and services."
				actions={
					<Button
						type="button"
						variant="outline"
						icon={<ArrowLeft className="size-4" weight="duotone" />}
						onClick={() => {
							void navigate({ to: "/orders", search: { page: 1 } });
						}}
					>
						Back to Orders
					</Button>
				}
			/>
			<div className="grid gap-4">
				<div className="rounded-none border p-4">
					<div className="mb-4 flex items-center gap-2 border-b pb-3">
						<ShoppingCart className="size-4" weight="duotone" />
						<p className="text-sm font-medium">Order Details</p>
					</div>
					<OrderForm
						handleOnSubmit={handleOnSubmit}
						allowedStoreIds={allowedStoreIds}
						isSubmitting={
							createMutation.isPending || currentUserDetailQuery.isPending
						}
					/>
				</div>
			</div>
		</>
	);
}
