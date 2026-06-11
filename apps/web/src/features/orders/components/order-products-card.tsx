import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderDetail } from "@/lib/api";
import { formatIDRCurrency } from "@/shared/utils";

interface OrderProductsCardProps {
	products: OrderDetail["products"];
}

export const OrderProductsCard = ({ products }: OrderProductsCardProps) => {
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
						<div
							key={item.id}
							className="flex items-center justify-between gap-4 border px-3 py-2.5 text-sm"
						>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-1.5">
									<p className="font-medium leading-snug">
										{item.product?.name ?? `Product #${item.product_id}`}
									</p>
									{item.refunded_at ? (
										<Badge variant="danger">Refunded</Badge>
									) : null}
								</div>
								<p className="text-muted-foreground text-xs">
									{formatIDRCurrency(String(item.price ?? 0))} x {item.qty}
									{item.notes ? ` · ${item.notes}` : ""}
								</p>
							</div>
							<p className="shrink-0 font-mono text-sm tabular-nums">
								{formatIDRCurrency(String(item.subtotal ?? 0))}
							</p>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
};
