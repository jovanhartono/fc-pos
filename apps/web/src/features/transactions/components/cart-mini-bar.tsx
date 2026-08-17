import {
	CaretDownIcon,
	CaretUpIcon,
	ShoppingCartIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/features/transactions/cart/useCart";
import { CartLines } from "@/features/transactions/components/cart-lines";
import { formatMoney } from "@/shared/money";

interface CartMiniBarProps {
	hasStore: boolean;
	onOpen: () => void;
}

export const CartMiniBar = ({ hasStore, onOpen }: CartMiniBarProps) => {
	const { count, subtotal } = useCart();

	if (count === 0) {
		return null;
	}

	// Keep the surface opaque: the catalog scrolls underneath, and a transparent
	// bar let service cards show through the hint text.
	return (
		<div className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 grid gap-1 border-border/70 border-t bg-background px-1 pt-2 pb-1 xl:hidden">
			{/* Says up front why the bar won't open, so the block isn't a dead-end
			    tap — this hint is the only in-place explanation the cashier gets. */}
			{hasStore ? null : (
				<p className="text-muted-foreground text-xs">
					Select a store to check out.
				</p>
			)}

			{/* Closed by default. Without it, dropping a mis-tapped line means keying
			    a customer name and phone first, because the lines only exist on step
			    two of the checkout. Capped height so an open cart cannot bury the
			    catalog the cashier is still tapping. */}
			<details className="group border border-border/70 bg-background">
				<summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 hover:bg-muted/30 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
					<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
						Cart
					</span>
					<CaretDownIcon
						aria-hidden="true"
						className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
					/>
				</summary>
				<div className="max-h-[40dvh] overflow-y-auto border-border/70 border-t px-3 py-2">
					<CartLines />
				</div>
			</details>

			<Button
				className="h-14 w-full justify-between gap-3"
				onClick={onOpen}
				size="lg"
				type="button"
			>
				<span className="flex items-center gap-2">
					<ShoppingCartIcon className="size-5" />
					<span className="font-medium">
						{count} {count === 1 ? "item" : "items"}
					</span>
				</span>
				<span className="flex items-center gap-2">
					<span className="font-semibold">{formatMoney(subtotal)}</span>
					<CaretUpIcon className="size-4" />
				</span>
			</Button>
		</div>
	);
};
