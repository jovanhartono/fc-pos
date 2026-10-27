import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
// so the way out is back to the list. In the sheet that is closing it, so a
// cashier on the Counter stays there and a filtered list keeps its filters.
export const OrderNotFound = () => {
	const isInSheet = useSheet((s) => s.sheetState.open);
	const onClose = useSheet((s) => s.sheetState.onClose);
	const closeSheet = useSheet((s) => s.closeSheet);
	if (isInSheet) {
		const handleClose = () => {
			onClose?.();
			closeSheet();
		};
		return (
			<EmptyState
				action={
					<Button onClick={handleClose} variant="outline">
						Close
					</Button>
				}
			>
				Order not found.
			</EmptyState>
		);
	}
	return (
		<EmptyState
			action={
				<Button
					icon={<HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />}
					nativeButton={false}
					render={<Link search={{ page: 1 }} to="/orders" />}
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
	// Read roles fresh: an admin can change them mid-session and the login
	// token would still carry the old ones.
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
				title="Couldn't load Order"
				description={
					detailQuery.error instanceof Error
						? detailQuery.error.message
						: "Try again."
				}
			/>
		);
	}

	if (!detailQuery.data) {
		return (
			<OrderDetailMessage
				tone="muted"
				title="Order not found"
				description="This Order doesn't exist, or it's at a Store you can't open."
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
