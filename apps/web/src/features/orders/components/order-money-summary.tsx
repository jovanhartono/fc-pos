import { Separator } from "@/components/ui/separator";
import type { OrderDetail } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatMoney, parseMoney } from "@/shared/money";

interface OrderMoneySummaryProps {
	detail: OrderDetail;
}

export const OrderMoneySummary = ({ detail }: OrderMoneySummaryProps) => {
	const discount = parseMoney(detail.discount);
	const net = parseMoney(detail.total) - discount;
	const refunded = parseMoney(detail.refunded_amount);

	const servicesSubtotal = detail.services.reduce(
		(sum, service) => sum + parseMoney(service.subtotal),
		0,
	);
	const productsSubtotal = detail.products.reduce(
		(sum, product) => sum + parseMoney(product.subtotal),
		0,
	);
	// Only worth splitting when the subtotal mixes both — otherwise the component
	// line just repeats the Subtotal.
	const showSubtotalBreakdown =
		detail.services.length > 0 && detail.products.length > 0;

	return (
		<div className="px-4 py-4">
			<dl className="grid gap-1.5 text-sm tabular-nums">
				{showSubtotalBreakdown ? (
					<>
						<div className="flex justify-between gap-4">
							<dt className="text-muted-foreground">Services</dt>
							<dd className="font-mono">{formatMoney(servicesSubtotal)}</dd>
						</div>
						<div className="flex justify-between gap-4">
							<dt className="text-muted-foreground">Products</dt>
							<dd className="font-mono">{formatMoney(productsSubtotal)}</dd>
						</div>
					</>
				) : null}
				<div className="flex justify-between gap-4">
					<dt className="text-muted-foreground">Subtotal</dt>
					<dd className="font-mono">{formatMoney(detail.total)}</dd>
				</div>
				{detail.campaigns.map((row) => (
					<div className="flex justify-between gap-4" key={row.id}>
						<dt className="text-muted-foreground">
							{row.campaign?.code ?? "Campaign"}
							{row.campaign?.name ? (
								<span className="text-muted-foreground/70">
									{" "}
									· {row.campaign.name}
								</span>
							) : null}
						</dt>
						<dd className="font-mono text-destructive">
							-{formatMoney(row.applied_amount)}
						</dd>
					</div>
				))}
				<div className="flex justify-between gap-4">
					<dt className="text-muted-foreground">Discount total</dt>
					<dd className={cn("font-mono", discount > 0 && "text-destructive")}>
						{discount > 0 ? `-${formatMoney(discount)}` : formatMoney(0)}
					</dd>
				</div>
			</dl>
			<Separator className="my-2.5" />
			<dl className="grid gap-1.5 text-sm tabular-nums">
				<div className="flex justify-between gap-4 font-medium">
					<dt>Net</dt>
					<dd className="font-mono">{formatMoney(net)}</dd>
				</div>
				{refunded > 0 ? (
					<div className="flex justify-between gap-4 text-destructive">
						<dt>Refunded</dt>
						<dd className="font-mono">-{formatMoney(refunded)}</dd>
					</div>
				) : null}
			</dl>
		</div>
	);
};
