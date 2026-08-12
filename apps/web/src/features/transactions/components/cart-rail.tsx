import { ShoppingCartIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	getServiceLinePrice,
	type ServiceCartDisplayLine,
} from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { formatMoney, parseMoney } from "@/shared/money";

// The descriptors the cashier keyed, in the order they read them off the item.
const getServiceDescriptors = (line: ServiceCartDisplayLine): string[] =>
	[line.brand, line.color, line.model, line.size]
		.map((value) => value.trim())
		.filter(Boolean);

interface CartRailProps {
	hasStore: boolean;
	onCheckout: () => void;
}

// Standing cart, laptop only. Below xl the bottom sheet is the right pattern and
// stays; at 1280+ the catalog and the cart could never be on screen together, so
// adding a forgotten item meant closing the sheet and losing your place in a
// 40-card grid. The running total and the thing being sold belong in one glance.
export const CartRail = ({ hasStore, onCheckout }: CartRailProps) => {
	const { productRows, serviceRows, subtotal, count } = useCart();

	return (
		<aside
			aria-label="Cart"
			className="sticky top-0 hidden max-h-dvh grid-rows-[auto_1fr_auto] border border-border/70 bg-muted/20 xl:grid"
		>
			<div className="flex items-baseline justify-between gap-2 border-border/70 border-b px-3 py-2">
				<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
					Cart
				</span>
				<span className="font-mono text-[10px] text-muted-foreground tabular-nums">
					{count} {count === 1 ? "item" : "items"}
				</span>
			</div>

			<div className="min-h-0 overflow-y-auto">
				{count === 0 ? (
					<p className="px-3 py-8 text-center text-muted-foreground text-xs">
						Tap a service to start an order.
					</p>
				) : (
					<ul className="grid gap-2 p-3">
						{productRows.map((line) => (
							<li
								className="grid gap-0.5 border-border/70 border-b border-dashed pb-2 last:border-b-0"
								key={`product-${line.id}`}
							>
								<div className="flex items-baseline justify-between gap-2">
									<span className="min-w-0 truncate font-medium text-xs">
										{line.qty} × {line.product.name}
									</span>
									<span className="shrink-0 font-mono text-[11px] tabular-nums">
										{formatMoney(parseMoney(line.product.price) * line.qty)}
									</span>
								</div>
							</li>
						))}

						{serviceRows.map((line, index) => {
							const descriptors = getServiceDescriptors(line);
							const isUnpriced =
								line.service.price === null && getServiceLinePrice(line) <= 0;

							return (
								<li
									className="grid gap-1 border-border/70 border-b border-dashed pb-2 last:border-b-0"
									key={line.line_id}
								>
									<div className="flex items-baseline justify-between gap-2">
										<span className="min-w-0 truncate font-medium text-xs">
											{index + 1} · {line.service.name}
										</span>
										<span className="shrink-0 font-mono text-[11px] tabular-nums">
											{formatMoney(getServiceLinePrice(line))}
										</span>
									</div>
									<div className="flex flex-wrap gap-1">
										{descriptors.length > 0 ? (
											descriptors.map((value) => (
												<span
													className="border border-border/70 bg-background px-1.5 font-mono text-[10px] text-muted-foreground"
													key={value}
												>
													{value}
												</span>
											))
										) : (
											<span className="font-mono text-[10px] text-muted-foreground">
												No detail yet
											</span>
										)}
										{isUnpriced ? (
											<span className="border border-warning/50 bg-warning/10 px-1.5 font-mono text-[10px] text-warning">
												No price yet
											</span>
										) : null}
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<div className="grid gap-2 border-border/70 border-t px-3 py-2.5">
				{/* Subtotal, not Total: campaigns, vouchers and any manual discount are
				    chosen in the checkout, so the number here is pre-discount and the
				    footer's Total is the one the customer pays. */}
				<div className="flex items-baseline justify-between gap-2">
					<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
						Subtotal
					</span>
					<span className="font-mono font-semibold text-sm tabular-nums">
						{formatMoney(subtotal)}
					</span>
				</div>
				{hasStore ? null : (
					<p className="text-muted-foreground text-xs">
						Select a store to check out.
					</p>
				)}
				<Button
					className="h-11 w-full"
					disabled={count === 0}
					icon={<ShoppingCartIcon className="size-4" />}
					onClick={onCheckout}
					type="button"
				>
					Check out
				</Button>
			</div>
		</aside>
	);
};
