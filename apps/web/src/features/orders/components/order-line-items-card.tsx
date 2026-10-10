import { CaretRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { OrderDetail, OrderRefundReason } from "@/features/orders/api";
import { ItemPhotoStrip } from "@/features/orders/components/item-photo-strip";
import { OrderReasonCallout } from "@/features/orders/components/order-reason-callout";
import { OrderSectionHeader } from "@/features/orders/components/order-section-header";
import { OrderServiceRow } from "@/features/orders/components/order-service-row";
import type { OrderItem } from "@/features/orders/lib/order-lines";
import { getItemTotalRow } from "@/features/orders/lib/order-sheet";
import { groupReworksUnderOriginals } from "@/features/orders/lib/rework-nesting";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { formatCancelReason, formatRefundReason } from "@/lib/status";
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
	<div className="border-t px-4 py-3 text-sm">
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
				<p className="text-muted-foreground text-xs tabular-nums">
					{formatMoney(product.price)} × {product.qty}
				</p>
			</div>
			<p className="shrink-0 text-sm tabular-nums">
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
	complaint: { id: number; reason: string };
}

// The cashier's way from the order to its Complaint, whether or not a Rework
// has started.
const ComplaintLinkRow = ({ complaint }: ComplaintLinkRowProps) => (
	<Link
		className="group flex items-center gap-1.5 py-2 pr-1 pl-3 text-xs hover:bg-muted/40"
		params={{ complaintId: String(complaint.id) }}
		to="/complaints/$complaintId"
	>
		<span className="min-w-0 flex-1 truncate">
			<span className="text-destructive">COMPLAINT #{complaint.id}</span>
			<span className="text-muted-foreground"> · {complaint.reason}</span>
		</span>
		<CaretRightIcon
			aria-hidden="true"
			className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
		/>
	</Link>
);

interface ItemBlockProps {
	orderId: number;
	item: OrderItem;
	isAdmin: boolean;
}

// One physical object and every treatment sold against it (ADR-0017). The tag
// and the descriptors are stated once here rather than repeated down each
// treatment — a pair in for a clean, a repaint and leather care used to read
// as three unrelated lines with three tag codes.
const ItemBlock = ({ orderId, item, isAdmin }: ItemBlockProps) => {
	const descriptors = getOrderServiceItemDetails(item);
	const totalRow = getItemTotalRow(item.services);

	return (
		<Card className="gap-0 py-0">
			{/* The object leads, the tag follows: what the cashier says out loud
			    is "the red New Balance", and the code is how the shelf finds it.
			    Same order as the queue card and the pickup dialog. No status here:
			    each line below shows its own. */}
			<header className="min-w-0 px-4 py-3">
				{descriptors ? (
					<>
						<h3 className="text-pretty font-semibold text-[15px] leading-5">
							{descriptors}
						</h3>
						<p className="break-all font-mono text-muted-foreground text-xs leading-snug">
							{item.item_code}
						</p>
					</>
				) : (
					<h3 className="break-all font-mono text-[15px] font-semibold leading-5">
						{item.item_code}
					</h3>
				)}
			</header>
			<ItemPhotoStrip isAdmin={isAdmin} item={item} orderId={orderId} />
			<ul className="mx-4 mb-3 divide-y border-l-2 border-border">
				{groupReworksUnderOriginals(
					item.services,
					(service) => service.reworkOf?.orderService.id ?? null,
				).map(({ original, originalId, reworks }) => (
					<li key={originalId}>
						{original ? (
							<OrderServiceRow
								itemCode={item.item_code}
								orderId={orderId}
								service={original}
							/>
						) : null}
						{original?.complaints.map((complaint) => (
							<ComplaintLinkRow complaint={complaint} key={complaint.id} />
						))}
						{reworks.length > 0 && (
							<ul>
								{reworks.map((rework, index) => (
									<li key={rework.id}>
										<OrderServiceRow
											itemCode={item.item_code}
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
				<footer className="mx-4 mb-3 flex items-center justify-between gap-3 border-t pt-2.5 text-sm">
					<span className="text-muted-foreground">Item total</span>
					<span className="font-semibold tabular-nums">
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

	const refundByProductId = useMemo(() => {
		const map = new Map<number, RefundInfo>();
		for (const refund of detail.refunds ?? []) {
			for (const item of refund.items) {
				if (item.order_product_id != null) {
					map.set(item.order_product_id, {
						reason: item.reason,
						note: item.note ?? undefined,
					});
				}
			}
		}
		return map;
	}, [detail.refunds]);

	return (
		<div className="grid gap-3 sm:gap-4">
			{/* A products-only sale has no card here at all: an empty "Items"
			    section says nothing the Products card below does not. */}
			{items.length > 0 ? (
				<section className="grid gap-3">
					<h2 className="text-foreground text-sm font-semibold">
						Items · {items.length}
					</h2>
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
				<Card className="gap-0 overflow-hidden py-0">
					<OrderSectionHeader>Products</OrderSectionHeader>
					{products.map((item) => (
						<ProductLine
							key={item.id}
							product={item}
							refund={refundByProductId.get(item.id)}
						/>
					))}
				</Card>
			) : null}
		</div>
	);
};
