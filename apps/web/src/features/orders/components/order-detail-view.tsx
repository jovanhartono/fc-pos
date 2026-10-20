import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ordersQueries } from "@/features/orders/api";
import { OrderAttachmentsCard } from "@/features/orders/components/order-attachments-card";
import { OrderIdentityStrip } from "@/features/orders/components/order-identity-strip";
import { OrderLineItemsCard } from "@/features/orders/components/order-line-items-card";
import { OrderPaymentSection } from "@/features/orders/components/order-payment-section";
import { useRefreshOrder } from "@/features/orders/hooks/useOrderMutations";
import { getOrderActionGates } from "@/features/orders/lib/order-action-gates";
import { usersQueries } from "@/features/users/api";
import { cn } from "@/lib/utils";

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

export const OrderDetailMessage = ({
	description,
	title,
	tone,
}: OrderDetailMessageProps) => (
	<EmptyState>
		<p
			className={cn(
				"font-medium text-foreground",
				tone === "error" && "text-destructive",
			)}
		>
			{title}
		</p>
		<p>{description}</p>
	</EmptyState>
);

interface OrderDetailViewProps {
	orderId: number;
}

// The whole Order: the /orders/$id page and the global sheet both render
// this, so the two never drift apart.
export const OrderDetailView = ({ orderId }: OrderDetailViewProps) => {
	// Role/can_process_pickup gates read DB-fresh state via /admin/users/me —
	// the JWT claims go stale when an admin changes them mid-session.
	const meQuery = useQuery(usersQueries.me());
	const detailQuery = useQuery(ordersQueries.detail(orderId));
	const refreshOrder = useRefreshOrder();

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

	return (
		<div className="@container/order">
			<OrderIdentityStrip detail={detail} gates={gates} orderId={orderId} />

			<div className="grid gap-3 sm:gap-4">
				<OrderLineItemsCard
					detail={detail}
					isAdmin={gates.isAdmin}
					orderId={orderId}
				/>

				<OrderPaymentSection detail={detail} gates={gates} orderId={orderId} />

				<OrderAttachmentsCard
					canManageDropoff={gates.canManageDropoffPhoto}
					onUploaded={refreshOrder}
					order={detail}
					pickupEvents={detail.pickup_events}
				/>
			</div>
		</div>
	);
};
