import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderDetail, OrderRefundReason } from "@/lib/api";
import { formatCancelReason, formatRefundReason } from "@/lib/status";
import { formatIDRCurrency } from "@/shared/utils";

type OrderDetailProduct = OrderDetail["products"][number];

interface RefundInfo {
	reason: OrderRefundReason;
	note?: string;
}

interface ProductLineProps {
	product: OrderDetailProduct;
	refund?: RefundInfo;
}

const ProductLine = ({ product, refund }: ProductLineProps) => (
	<div className="border px-3 py-2.5 text-sm">
		<div className="flex items-center justify-between gap-4">
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
				<p className="text-muted-foreground text-xs">
					{formatIDRCurrency(String(product.price ?? 0))} x {product.qty}
				</p>
			</div>
			<p className="shrink-0 font-mono text-sm tabular-nums">
				{formatIDRCurrency(String(product.subtotal ?? 0))}
			</p>
		</div>

		{product.cancelled_at && product.cancel_reason ? (
			<div className="mt-2.5 border border-destructive/40 bg-destructive/5 p-3">
				<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
					Cancel reason
				</p>
				<p className="mt-1 text-sm font-medium">
					{formatCancelReason(product.cancel_reason)}
				</p>
				{product.cancel_note ? (
					<p className="text-muted-foreground mt-1 text-sm">
						{product.cancel_note}
					</p>
				) : null}
			</div>
		) : null}

		{refund ? (
			<div className="mt-2.5 border border-destructive/40 bg-destructive/5 p-3">
				<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
					Refund reason
				</p>
				<p className="mt-1 text-sm font-medium">
					{formatRefundReason(refund.reason)}
				</p>
				{refund.note ? (
					<p className="text-muted-foreground mt-1 text-sm">{refund.note}</p>
				) : null}
			</div>
		) : null}
	</div>
);

interface OrderProductsCardProps {
	products: OrderDetail["products"];
	refunds: OrderDetail["refunds"];
}

export const OrderProductsCard = ({
	products,
	refunds,
}: OrderProductsCardProps) => {
	const refundByProductId = useMemo(() => {
		const map = new Map<number, RefundInfo>();
		for (const refund of refunds ?? []) {
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
	}, [refunds]);

	if (products.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Products</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid gap-2">
					{products.map((item) => (
						<ProductLine
							key={item.id}
							product={item}
							refund={refundByProductId.get(item.id)}
						/>
					))}
				</div>
			</CardContent>
		</Card>
	);
};
