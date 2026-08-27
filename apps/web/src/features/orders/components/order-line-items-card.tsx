import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { OrderReasonCallout } from "@/features/orders/components/order-reason-callout";
import { OrderSectionHeader } from "@/features/orders/components/order-section-header";
import { OrderServiceRow } from "@/features/orders/components/order-service-row";
import type { OrderItem } from "@/features/orders/lib/order-lines";
import type { OrderDetail, OrderRefundReason } from "@/lib/api";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import {
	formatCancelReason,
	formatOrderServiceStatus,
	formatRefundReason,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
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
			<p className="shrink-0 font-mono text-sm tabular-nums">
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

	return (
		<article className="border-t">
			<header className="flex items-start justify-between gap-3 bg-muted/30 px-4 py-2.5">
				<div className="min-w-0">
					<p className="break-all font-mono text-[13px] font-semibold leading-5">
						{item.item_code}
					</p>
					{descriptors ? (
						<p className="text-muted-foreground text-xs leading-snug">
							{descriptors}
						</p>
					) : null}
				</div>
				<Badge variant={getOrderServiceStatusBadgeVariant(item.status)}>
					{formatOrderServiceStatus(item.status)}
				</Badge>
			</header>
			{item.services.map((service) => (
				<OrderServiceRow
					isAdmin={isAdmin}
					itemCode={item.item_code}
					key={service.id}
					orderId={orderId}
					service={service}
				/>
			))}
		</article>
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
			<Card className="gap-0 overflow-hidden py-0">
				<OrderSectionHeader>Items</OrderSectionHeader>
				{items.length > 0 ? (
					items.map((item) => (
						<ItemBlock
							isAdmin={isAdmin}
							item={item}
							key={item.id}
							orderId={orderId}
						/>
					))
				) : (
					<p className="px-4 py-6 text-muted-foreground text-sm">
						No items dropped off.
					</p>
				)}
			</Card>

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
