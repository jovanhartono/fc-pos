import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ordersQueries } from "@/features/orders/api";
import {
	OrderAttachmentsCard,
	OrderAttachmentsSkeleton,
} from "@/features/orders/components/order-attachments-card";
import {
	OrderIdentityStrip,
	OrderIdentityStripSkeleton,
} from "@/features/orders/components/order-identity-strip";
import {
	OrderItemsSkeleton,
	OrderLineItemsCard,
} from "@/features/orders/components/order-line-items-card";
import {
	OrderPaymentSection,
	OrderPaymentSkeleton,
} from "@/features/orders/components/order-payment-section";
import { useRefreshOrder } from "@/features/orders/hooks/useOrderMutations";
import { getOrderActionGates } from "@/features/orders/lib/order-action-gates";
import { usersQueries } from "@/features/users/api";
import { CONTENT_FADE } from "@/lib/content-fade";
import { isNotFoundError } from "@/lib/server-error";
import { cn } from "@/lib/utils";
import { useSheet } from "@/stores/sheet-store";

// A paid one-Item Order drawn from the real section shells, so each card is
// already its loaded height at every width and nothing moves when it lands.
const OrderDetailSkeleton = () => (
	<div aria-hidden className="@container/order">
		<OrderIdentityStripSkeleton />
		<div className="grid gap-3 sm:gap-4">
			<OrderItemsSkeleton />
			<OrderPaymentSkeleton />
			<OrderAttachmentsSkeleton />
		</div>
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

// An old or mistyped link to an Order that doesn't exist; Retry can't help,
// so the way out is back to the list.
export const OrderNotFound = () => {
	const closeSheet = useSheet((s) => s.closeSheet);
	return (
		<EmptyState
			action={
				<Button
					icon={<ArrowLeftIcon className="size-4" />}
					nativeButton={false}
					render={
						<Link onClick={closeSheet} search={{ page: 1 }} to="/orders" />
					}
					variant="outline"
				>
					Back to Orders
				</Button>
			}
		>
			Order not found.
		</EmptyState>
	);
};

interface OrderDetailViewProps {
	orderId: number;
}

// The whole Order: the /orders/$id page and the global sheet both render
// this, so the two never drift apart.
export const OrderDetailView = ({ orderId }: OrderDetailViewProps) => {
	// Role/can_process_pickup gates read DB-fresh state via /admin/users/me —
	// the JWT claims go stale when an admin changes them mid-session.
	const meQuery = useQuery(usersQueries.me());
	const detailQuery = useQuery({
		...ordersQueries.detail(orderId),
		// A missing Order stays missing; asking again only holds the skeleton up.
		retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 3,
	});
	const refreshOrder = useRefreshOrder();

	if (detailQuery.isPending) {
		return <OrderDetailSkeleton />;
	}

	if (isNotFoundError(detailQuery.error)) {
		return <OrderNotFound />;
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
		<div className={cn("@container/order", CONTENT_FADE)}>
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
