import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderAttachmentsCard } from "@/features/orders/components/order-attachments-card";
import { OrderIdentityStrip } from "@/features/orders/components/order-identity-strip";
import { OrderLineItemsCard } from "@/features/orders/components/order-line-items-card";
import { OrderPaymentSection } from "@/features/orders/components/order-payment-section";
import { useRefreshOrder } from "@/features/orders/hooks/useOrderMutations";
import { getOrderActionGates } from "@/features/orders/lib/order-action-gates";
import {
	meQueryOptions,
	orderDetailQueryOptions,
	paymentMethodsQueryOptions,
} from "@/lib/query-options";

export const Route = createFileRoute("/_admin/orders/$orderId")({
	loader: async ({ context, params }) => {
		const id = Number(params.orderId);

		if (!Number.isInteger(id) || id <= 0) {
			return;
		}

		await Promise.all([
			context.queryClient.ensureQueryData(orderDetailQueryOptions(id)),
			context.queryClient.ensureQueryData(paymentMethodsQueryOptions()),
			context.queryClient.ensureQueryData(meQueryOptions()),
		]);
	},
	component: OrderDetailPage,
});

const OrderDetailSkeleton = () => (
	<div className="grid gap-4">
		<Skeleton className="h-28 w-full" />
		<Skeleton className="h-64 w-full" />
		<Skeleton className="h-52 w-full" />
		<Skeleton className="h-64 w-full" />
	</div>
);

interface OrderDetailMessageProps {
	description: string;
	title: string;
	tone: "error" | "muted";
}

const OrderDetailMessage = ({
	description,
	title,
	tone,
}: OrderDetailMessageProps) => (
	<div
		className={
			tone === "error"
				? "grid gap-1 border border-destructive/40 bg-destructive/5 p-6 text-sm"
				: "grid gap-1 border border-border/70 bg-muted/30 p-6 text-sm"
		}
	>
		<p className="font-medium">{title}</p>
		<p className="text-muted-foreground">{description}</p>
	</div>
);

function OrderDetailPage() {
	const { orderId } = Route.useParams();
	const parsedOrderId = Number(orderId);
	const isValidOrderId = Number.isInteger(parsedOrderId) && parsedOrderId > 0;

	if (!isValidOrderId) {
		return (
			<OrderDetailMessage
				tone="error"
				title="Invalid order ID"
				description="The URL does not point to a valid order."
			/>
		);
	}

	return <AdminOrderDetailPage orderId={parsedOrderId} />;
}

function AdminOrderDetailPage({ orderId: id }: { orderId: number }) {
	// Role/can_process_pickup gates read DB-fresh state via /admin/users/me —
	// the JWT claims go stale when an admin changes them mid-session.
	const meQuery = useQuery(meQueryOptions());
	const detailQuery = useQuery(orderDetailQueryOptions(id));
	const refreshOrder = useRefreshOrder(id);

	if (detailQuery.isPending) {
		return <OrderDetailSkeleton />;
	}

	if (detailQuery.isError) {
		return (
			<OrderDetailMessage
				tone="error"
				title="Failed to load order"
				description={
					detailQuery.error instanceof Error
						? detailQuery.error.message
						: "Please try again in a moment."
				}
			/>
		);
	}

	if (!detailQuery.data) {
		return (
			<OrderDetailMessage
				tone="muted"
				title="Order not found"
				description="It may have been deleted or you may not have access."
			/>
		);
	}

	const detail = detailQuery.data;
	const gates = getOrderActionGates(meQuery.data, detail);
	const pickupEvents = detail.pickup_events;

	return (
		<>
			<OrderIdentityStrip detail={detail} gates={gates} orderId={id} />

			<div className="grid gap-3 sm:gap-4">
				<OrderLineItemsCard
					detail={detail}
					isAdmin={gates.isAdmin}
					orderId={id}
				/>

				<OrderPaymentSection detail={detail} gates={gates} orderId={id} />

				<OrderAttachmentsCard
					canManageDropoff={gates.canManageDropoffPhoto}
					onUploaded={refreshOrder}
					order={detail}
					pickupEvents={pickupEvents}
				/>
			</div>
		</>
	);
}
