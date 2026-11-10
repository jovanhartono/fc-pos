import { Link } from "@tanstack/react-router";
import {
	MessageRowContent,
	ROW_TAP,
	ROW_TAP_NESTED,
} from "@/components/message-row";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { OrderDetail, OrderRefundReason } from "@/features/orders/api";
import { ItemPhotoStrip } from "@/features/orders/components/item-photo-strip";
import {
	ITEM_CODE,
	ITEM_NAME,
	SERVICE_LIST,
} from "@/features/orders/components/order-detail-parts";
import { OrderReasonCallout } from "@/features/orders/components/order-reason-callout";
import { OrderSectionHeader } from "@/features/orders/components/order-section-header";
import { OrderServiceRow } from "@/features/orders/components/order-service-row";
import { startPhotoBlocker } from "@/features/orders/lib/order-action-gates";
import type { OrderItem } from "@/features/orders/lib/order-lines";
import { getItemTotalRow } from "@/features/orders/lib/order-sheet";
import { groupReworksUnderOriginals } from "@/features/orders/lib/rework-nesting";
import { useLeaveSheetLink } from "@/hooks/useLeaveSheetLink";
import { formatDay } from "@/lib/dayjs";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { formatCancelReason, formatRefundReason } from "@/lib/status";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

type OrderDetailProduct = OrderDetail["products"][number];

interface RefundInfo {
	reason: OrderRefundReason;
	note?: string;
}

const ProductLine = ({
	product,
	refund,
}: {
	product: OrderDetailProduct;
	refund?: RefundInfo;
}) => (
	<div className="px-4 py-3 text-body compact:text-subhead">
		<div className="flex items-start justify-between gap-4">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-1.5">
					<p className="font-medium leading-snug">
						{product.product?.name ?? `Product #${product.product_id}`}
					</p>
					{product.refunded_at ? (
						<Badge variant="danger">Refunded</Badge>
					) : null}
					{product.cancelled_at ? (
						<Badge variant="danger">Cancelled</Badge>
					) : null}
				</div>
				<p className="text-foreground text-subhead tabular-nums">
					{formatMoney(product.price)} × {product.qty}
				</p>
			</div>
			<p className="shrink-0 text-body tabular-nums compact:text-subhead">
				{formatMoney(product.subtotal)}
			</p>
		</div>

		{product.cancelled_at && product.cancel_reason ? (
			<OrderReasonCallout
				className="mt-2.5"
				label="Cancel reason"
				note={product.cancel_note}
				reason={formatCancelReason(product.cancel_reason)}
			/>
		) : null}

		{refund ? (
			<OrderReasonCallout
				className="mt-2.5"
				label="Refund reason"
				note={refund.note}
				reason={formatRefundReason(refund.reason)}
			/>
		) : null}
	</div>
);

interface ComplaintLinkRowProps {
	complaint: { id: number; reason: string; created_at: string };
}

// The cashier's way from the order to its Complaint, whether or not a Rework
// has started. No outcome badge: the Reworks under it show their own status.
const ComplaintLinkRow = ({ complaint }: ComplaintLinkRowProps) => {
	const leaveSheet = useLeaveSheetLink();
	return (
		<Link
			className={cn(ROW_TAP, ROW_TAP_NESTED)}
			onClick={leaveSheet}
			params={{ complaintId: String(complaint.id) }}
			to="/complaints/$complaintId"
		>
			<MessageRowContent
				date={formatDay(complaint.created_at)}
				lead={`Complaint #${complaint.id}`}
				text={complaint.reason}
			/>
		</Link>
	);
};

interface ItemBlockProps {
	orderId: number;
	item: OrderItem;
	isAdmin: boolean;
}

// One Item and every OrderService on it (ADR-0017), so a shoe in for a clean,
// a repaint and leather care no longer reads as three unrelated lines.
const ItemBlock = ({ orderId, item, isAdmin }: ItemBlockProps) => {
	const descriptors = getOrderServiceItemDetails(item);
	const totalRow = getItemTotalRow(item.services);

	return (
		<Card className="gap-0 py-0">
			{/* The Item leads, the tag follows: the cashier says "the red New
			    Balance", the shelf finds it by code. Each line shows its own status. */}
			<header className="min-w-0 px-4 py-3">
				{descriptors ? (
					<>
						<h3 className={ITEM_NAME}>{descriptors}</h3>
						<p className={ITEM_CODE}>{item.item_code}</p>
					</>
				) : (
					<h3 className="break-all font-medium text-headline leading-5 tabular-nums compact:text-body">
						{item.item_code}
					</h3>
				)}
			</header>
			<ItemPhotoStrip
				isAdmin={isAdmin}
				item={item}
				orderId={orderId}
				photoBlocker={item.services
					.map(startPhotoBlocker)
					.find((blocker) => blocker !== undefined)}
			/>
			<ul className={SERVICE_LIST}>
				{groupReworksUnderOriginals(
					item.services,
					(service) => service.reworkOf?.orderService.id ?? null,
				).map(({ original, originalId, reworks }) => (
					<li key={originalId}>
						{original !== undefined && (
							<OrderServiceRow orderId={orderId} service={original} />
						)}
						{original?.complaints.map((complaint) => (
							<ComplaintLinkRow complaint={complaint} key={complaint.id} />
						))}
						{reworks.length > 0 && (
							<ul>
								{reworks.map((rework, index) => (
									<li key={rework.id}>
										<OrderServiceRow
											orderId={orderId}
											reworkRound={original ? index + 1 : undefined}
											service={rework}
										/>
									</li>
								))}
							</ul>
						)}
					</li>
				))}
			</ul>
			{totalRow ? (
				<footer className="mx-4 mb-3 flex items-center justify-between gap-3 border-t pt-2.5 text-body compact:text-subhead">
					<span className="text-muted-foreground">Item total</span>
					<span className="font-medium tabular-nums">
						{totalRow.amount === null ? "—" : formatMoney(totalRow.amount)}
					</span>
				</footer>
			) : null}
		</Card>
	);
};

interface OrderLineItemsCardProps {
	orderId: number;
	detail: OrderDetail;
	isAdmin: boolean;
}

export const OrderLineItemsCard = ({
	orderId,
	detail,
	isAdmin,
}: OrderLineItemsCardProps) => {
	const { items, products } = detail;

	const refundByProductId = new Map<number, RefundInfo>();
	for (const refund of detail.refunds ?? []) {
		for (const item of refund.items) {
			if (item.order_product_id != null) {
				refundByProductId.set(item.order_product_id, {
					reason: item.reason,
					note: item.note ?? undefined,
				});
			}
		}
	}

	return (
		<div className="grid gap-3 sm:gap-4">
			{/* A products-only sale has no card here at all: an empty "Items"
			    section says nothing the Products card below does not. */}
			{items.length > 0 ? (
				<section className="grid gap-3">
					<OrderSectionHeader>Items · {items.length}</OrderSectionHeader>
					{items.map((item) => (
						<ItemBlock
							isAdmin={isAdmin}
							item={item}
							key={item.id}
							orderId={orderId}
						/>
					))}
				</section>
			) : null}

			{products.length > 0 ? (
				<section className="grid gap-3">
					<OrderSectionHeader>Products</OrderSectionHeader>
					<Card className="gap-0 divide-y overflow-hidden py-0">
						{products.map((item) => (
							<ProductLine
								key={item.id}
								product={item}
								refund={refundByProductId.get(item.id)}
							/>
						))}
					</Card>
				</section>
			) : null}
		</div>
	);
};
