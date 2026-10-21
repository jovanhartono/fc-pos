import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ordersQueries } from "@/features/orders/api";
import { OrderAttachmentsCard } from "@/features/orders/components/order-attachments-card";
import { OrderIdentityStrip } from "@/features/orders/components/order-identity-strip";
import { OrderLineItemsCard } from "@/features/orders/components/order-line-items-card";
import { OrderPaymentSection } from "@/features/orders/components/order-payment-section";
import { OrderSectionHeader } from "@/features/orders/components/order-section-header";
import { useRefreshOrder } from "@/features/orders/hooks/useOrderMutations";
import { getOrderActionGates } from "@/features/orders/lib/order-action-gates";
import { usersQueries } from "@/features/users/api";
import { CONTENT_FADE } from "@/lib/content-fade";
import { isNotFoundError } from "@/lib/server-error";
import { cn } from "@/lib/utils";
import { useSheet } from "@/stores/sheet-store";

interface SkeletonSectionProps {
	cardClassName: string;
	title: string;
}

// The real section heading over a card the height a one-Item Order draws.
const SkeletonSection = ({ cardClassName, title }: SkeletonSectionProps) => (
	<section className="grid gap-3">
		<OrderSectionHeader>{title}</OrderSectionHeader>
		<Card className={cn("gap-3 p-4", cardClassName)}>
			<Skeleton className="my-0.5 h-4 w-1/2" />
			<Skeleton className="my-0.5 h-3.5 w-1/3" />
		</Card>
	</section>
);

// Laid out like a new one-Item Order, so the cards land where their shells
// were. Sized by the Order's own width: a phone page, the sheet over a list,
// and the full desktop page each draw it a little differently.
const OrderDetailSkeleton = () => (
	<div aria-hidden className="@container/order">
		<Card className="mb-4 h-33.5 sm:mb-6 @md/order:h-24 @3xl/order:h-24.5">
			<CardContent className="grid gap-2">
				<div className="flex items-center justify-between gap-3">
					<Skeleton className="h-6 w-44 sm:h-7" />
					<Skeleton className="h-9 w-20 rounded-sm pointer-coarse:h-11" />
				</div>
				<Skeleton className="my-0.5 h-4 w-56" />
			</CardContent>
		</Card>
		<div className="grid gap-3 sm:gap-4">
			<SkeletonSection
				cardClassName="h-116 @md/order:h-111.25 @3xl/order:h-113"
				title="Items"
			/>
			<SkeletonSection
				cardClassName="h-36.75 @md/order:h-34.75 @3xl/order:h-36.75"
				title="Payment"
			/>
			<SkeletonSection
				cardClassName="h-70 @md/order:h-70.5 @3xl/order:h-74.75"
				title="Attachments"
			/>
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
