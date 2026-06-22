import type { ReactNode } from "react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { OrderMoneySummary } from "@/features/orders/components/order-money-summary";
import { OrderReasonCallout } from "@/features/orders/components/order-reason-callout";
import { OrderServiceRow } from "@/features/orders/components/order-service-row";
import type { OrderDetail, OrderRefundReason } from "@/lib/api";
import { formatCancelReason, formatRefundReason } from "@/lib/status";
import { formatIDRCurrency } from "@/shared/utils";

type OrderDetailProduct = OrderDetail["products"][number];

interface RefundInfo {
	reason: OrderRefundReason;
	note?: string;
}

const SectionHeader = ({ children }: { children: ReactNode }) => (
	<div className="flex items-center justify-between px-4 py-2.5">
		<p className="text-foreground text-sm font-semibold">{children}</p>
	</div>
);

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
					{formatIDRCurrency(String(product.price ?? 0))} × {product.qty}
				</p>
			</div>
			<p className="shrink-0 font-mono text-sm tabular-nums">
				{formatIDRCurrency(String(product.subtotal ?? 0))}
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
	const { services, products } = detail;

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
				<SectionHeader>Services</SectionHeader>
				{services.length > 0 ? (
					services.map((service) => (
						<OrderServiceRow
							isAdmin={isAdmin}
							key={service.id}
							orderId={orderId}
							service={service}
						/>
					))
				) : (
					<p className="px-4 py-6 text-muted-foreground text-sm">
						No service lines.
					</p>
				)}
			</Card>

			{products.length > 0 ? (
				<Card className="gap-0 overflow-hidden py-0">
					<SectionHeader>Products</SectionHeader>
					{products.map((item) => (
						<ProductLine
							key={item.id}
							product={item}
							refund={refundByProductId.get(item.id)}
						/>
					))}
				</Card>
			) : null}

			<Card className="gap-0 overflow-hidden py-0">
				<SectionHeader>Totals</SectionHeader>
				<OrderMoneySummary detail={detail} />
			</Card>
		</div>
	);
};
