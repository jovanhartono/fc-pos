import {
	CaretDownIcon,
	CaretUpIcon,
	ShoppingCartIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
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
	const [isPeeking, setIsPeeking] = useState(false);

	if (count === 0) {
		return null;
	}

	// The bar floats over the catalog rather than docking to a full-width panel,
	// so every child carries its own frosted surface (backdrop blur + translucent
	// background) — a bare transparent one lets service cards show through the
	// text (the original B4 bug), while frost keeps the catalog as soft depth.
	// The wrapper is pointer-transparent so gaps between children stay tappable.
	return (
		<div className="pointer-events-none sticky bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 grid gap-1 px-1">
			{/* Says up front why the bar won't open, so the block isn't a dead-end
			    tap — this hint is the only in-place explanation the cashier gets. */}
			{hasStore ? null : (
				<p className="pointer-events-auto justify-self-start border border-border/70 bg-background/70 px-2 py-1 text-muted-foreground text-xs backdrop-blur-xl">
					Select a store to check out.
				</p>
			)}

			{/* Peek panel above the bar. Without it, dropping a mis-tapped line means
			    keying a customer name and phone first, because the lines otherwise
			    only exist on step two of the checkout. Capped height so an open cart
			    cannot bury the catalog the cashier is still tapping. */}
			{isPeeking ? (
				<div className="pointer-events-auto max-h-[40dvh] overflow-y-auto overscroll-contain border border-border/70 bg-background/70 px-3 py-2 backdrop-blur-xl">
					<CartLines />
				</div>
			) : null}

			{/* Frosted strip under the buttons: the catalog scrolling behind reads as
			    blurred depth instead of card borders cutting into the bar's edges. */}
			<div className="pointer-events-auto flex gap-1 bg-background/40 p-1 backdrop-blur-xl">
				<Button
					aria-expanded={isPeeking}
					className="h-14 gap-2 bg-transparent"
					onClick={() => setIsPeeking((open) => !open)}
					size="lg"
					type="button"
					variant="outline"
				>
					<ShoppingCartIcon className="size-5" />
					{/* Lines, not Items: this counts what is on the bill, so an
					    upsold pair is two of them though the customer handed over one
					    shoe. "Item" means the physical object now (ADR-0017). */}
					<span className="font-medium">
						{count} {count === 1 ? "line" : "lines"}
					</span>
					{isPeeking ? (
						<CaretDownIcon aria-hidden="true" className="size-4" />
					) : (
						<CaretUpIcon aria-hidden="true" className="size-4" />
					)}
				</Button>
				<Button
					className="h-14 flex-1 justify-between gap-3"
					onClick={() => {
						setIsPeeking(false);
						onOpen();
					}}
					size="lg"
					type="button"
				>
					<span className="font-semibold">{formatMoney(subtotal)}</span>
					<span className="font-medium">Check out</span>
				</Button>
			</div>
		</div>
	);
};
