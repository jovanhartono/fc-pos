import { PackageDeliveredIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import { EmptyState } from "@/components/empty-state";
import { Section } from "@/components/section";
import { TextSkeleton } from "@/components/text-skeleton";
import { WhatsappIcon } from "@/components/whatsapp-icon";
import {
	type CounterPickupShelf,
	counterQueries,
	type CounterShelfOrder as ShelfOrder,
} from "@/features/counter/api";
import { formatDays } from "@/features/counter/lib/format";
import { NotifiedLabel } from "@/features/orders/components/notified-label";
import { OrderListRow } from "@/features/orders/components/order-list-row";
import { useNotifyCustomer } from "@/features/orders/hooks/useNotifyCustomer";
import { useLoadMore } from "@/hooks/useLoadMore";
import { pluralize } from "@/shared/utils";

const SHELF_VISIBLE_ROWS = 9;

interface ShelfNotifyActionProps {
	order: ShelfOrder;
}

const ShelfNotifyAction = ({ order }: ShelfNotifyActionProps) => {
	const notifyCustomer = useNotifyCustomer(order.order_id);

	return (
		<button
			className="inline-flex items-center gap-1 font-medium text-body text-tone-good-foreground whitespace-nowrap hover:text-tone-good-foreground/80"
			onClick={() =>
				notifyCustomer({
					customerName: order.customer_name,
					phone: order.customer_phone,
					lastNotice: null,
				})
			}
			type="button"
		>
			<HugeiconsIcon
				icon={WhatsappIcon}
				aria-hidden="true"
				className="size-4"
			/>
			Notify
		</button>
	);
};

interface ShelfRowProps {
	isActive: boolean;
	isWide: boolean;
	order: ShelfOrder;
}

const ShelfRow = ({ isActive, isWide, order }: ShelfRowProps) => {
	const rowProps = {
		action: order.notified ? undefined : <ShelfNotifyAction order={order} />,
		badges: order.notified ? <NotifiedLabel /> : undefined,
		className: "rounded-none px-3",
		details: [
			`ready ${formatDays(order.ready_days)}`,
			pluralize(order.items, "Item"),
		],
		isActive,
		title: order.customer_name,
	};

	if (isWide) {
		return (
			<OrderListRow
				{...rowProps}
				from="/counter"
				replace
				resetScroll={false}
				search={(prev) => ({ ...prev, open: order.order_id })}
			/>
		);
	}
	return (
		<OrderListRow
			{...rowProps}
			params={{ orderId: String(order.order_id) }}
			to="/orders/$orderId"
		/>
	);
};

// As tall as a loaded ShelfRow, so rows arriving never move the card.
const ShelfRowSkeleton = () => (
	<li aria-hidden className="grid gap-1 px-3 py-2.5">
		<TextSkeleton className="w-40 text-body" />
		<TextSkeleton className="w-28 text-subhead" />
	</li>
);

const skeletonRows = (count: number) =>
	Array.from({ length: count }, (_, index) => (
		<ShelfRowSkeleton key={`skeleton-${index}`} />
	));

interface ShelfListProps {
	isWide: boolean;
	openOrderId?: number;
	orders: number;
	storeId: number;
}

const ShelfList = ({
	isWide,
	openOrderId,
	orders,
	storeId,
}: ShelfListProps) => {
	const shelfQuery = useInfiniteQuery(counterQueries.pickupShelf(storeId));
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const loadMoreRef = useLoadMore(shelfQuery, {
		getRoot: () => scrollRef.current,
		rootMargin: "120px 0px",
	});

	const loaded = shelfQuery.data?.pages.flatMap((page) => page.items);

	let rows = skeletonRows(Math.min(orders, SHELF_VISIBLE_ROWS));
	if (loaded) {
		rows = loaded.map((order) => (
			<li key={order.order_id}>
				<ShelfRow
					isActive={order.order_id === openOrderId}
					isWide={isWide}
					order={order}
				/>
			</li>
		));
	} else if (shelfQuery.isError) {
		rows = [
			<li className="px-3 py-2.5 text-destructive" key="error">
				Could not load the shelf.
			</li>,
		];
	}

	// A row is 62px plus its 1px divider; the list stops at eight and a half, so
	// the half row tells the cashier there is more to scroll.
	return (
		<div className="max-h-[535px] overflow-y-auto" ref={scrollRef}>
			<ul className="divide-y divide-border">
				{rows}
				{shelfQuery.isFetchingNextPage ? skeletonRows(2) : null}
			</ul>
			<div aria-hidden className="h-px" ref={loadMoreRef} />
		</div>
	);
};

interface PickupShelfSectionProps {
	isWide: boolean;
	openOrderId?: number;
	shelf: CounterPickupShelf;
	storeId: number;
}

export const PickupShelfSection = ({
	isWide,
	openOrderId,
	shelf,
	storeId,
}: PickupShelfSectionProps) => (
	<Section
		count={`${pluralize(shelf.orders, "Order")} · ${pluralize(shelf.items, "Item")}`}
		title="Pickup Shelf"
	>
		{shelf.orders === 0 ? (
			<EmptyState icon={PackageDeliveredIcon}>Nothing on the shelf.</EmptyState>
		) : (
			<div className="overflow-hidden rounded-lg border bg-card">
				<ShelfList
					isWide={isWide}
					openOrderId={openOrderId}
					orders={shelf.orders}
					storeId={storeId}
				/>
				<Link
					className="block border-border border-t px-3 py-2 font-medium hover:bg-muted"
					search={{ page: 1, status: "ready_for_pickup", storeId }}
					to="/orders"
				>
					All {shelf.orders} Ready {shelf.orders === 1 ? "Order" : "Orders"} →
				</Link>
			</div>
		)}
	</Section>
);
