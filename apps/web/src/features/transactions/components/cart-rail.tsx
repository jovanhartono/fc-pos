import { ShoppingCartIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/features/transactions/cart/useCart";
import { CartLines } from "@/features/transactions/components/cart-lines";
import { formatMoney } from "@/shared/money";

interface CartRailProps {
	hasStore: boolean;
	onCheckout: () => void;
}

export const CartRail = ({ hasStore, onCheckout }: CartRailProps) => {
	const { subtotal, count } = useCart();

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
					<div className="p-3">
						<CartLines />
					</div>
				)}
			</div>

			<div className="grid gap-2 border-border/70 border-t px-3 py-2.5">
				{/* Subtotal, never Total: discounts are chosen in the checkout, so this
				    number is pre-discount and is not what the customer pays. */}
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
