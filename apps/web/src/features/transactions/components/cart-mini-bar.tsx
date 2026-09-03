import {
	CaretDownIcon,
	CaretUpIcon,
	ShoppingCartIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { countCartTreatments } from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { CartLines } from "@/features/transactions/components/cart-lines";
import { ItemTray } from "@/features/transactions/components/item-tray";
import { formatMoney } from "@/shared/money";
import { pluralize } from "@/shared/utils";

interface CartMiniBarProps {
	hasStore: boolean;
	onOpen: () => void;
}

export const CartMiniBar = ({ hasStore, onOpen }: CartMiniBarProps) => {
	const { count, subtotal, itemRows } = useCart();
	const [isPeeking, setIsPeeking] = useState(false);
	// What is on the bill: treatments and products. The objects themselves are
	// the tray directly above — one chip each — so counting them here again only
	// made the label too long for a phone (ADR-0017).
	const treatmentCount = countCartTreatments(itemRows);
	const productCount = count - treatmentCount;
	const summaryLabel = [
		treatmentCount > 0 ? pluralize(treatmentCount, "treatment") : null,
		productCount > 0 ? pluralize(productCount, "product") : null,
	]
		.filter(Boolean)
		.join(" · ");

	if (count === 0) {
		return null;
	}

	// The bar floats over the catalog rather than docking to a full-width panel,
	// so every child carries its own frosted surface (backdrop blur + translucent
	// background) — a bare transparent one lets service cards show through the
	// text (the original B4 bug), while frost keeps the catalog as soft depth.
	// The wrapper is pointer-transparent so gaps between children stay tappable.
	return (
		// min-w-0 here and on the button row: both sit in auto grid tracks, whose
		// minimum is the content's minimum width unless told otherwise — so a long
		// summary label widened the whole page grid past a phone's viewport
		// instead of truncating.
		<div className="pointer-events-none sticky bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 grid min-w-0 gap-1 px-1">
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

			<ItemTray itemRows={itemRows} />

			{/* Frosted strip under the buttons: the catalog scrolling behind reads as
			    blurred depth instead of card borders cutting into the bar's edges. */}
			<div className="pointer-events-auto flex min-w-0 gap-1 bg-background/40 p-1 backdrop-blur-xl">
				{/* min-w-0 + shrink: a mixed cart's label ("2 items · 2 treatments ·
				    1 product") is wider than a phone has room for beside Check out.
				    Without it this row's minimum width is the sum of both buttons,
				    and the page grid stretches past the viewport to fit it. */}
				<Button
					aria-expanded={isPeeking}
					className="h-14 min-w-0 shrink gap-2 bg-transparent"
					onClick={() => setIsPeeking((open) => !open)}
					size="lg"
					type="button"
					variant="outline"
				>
					<ShoppingCartIcon className="size-5" />
					<span className="min-w-0 truncate font-medium">{summaryLabel}</span>
					{isPeeking ? (
						<CaretDownIcon aria-hidden="true" className="size-4" />
					) : (
						<CaretUpIcon aria-hidden="true" className="size-4" />
					)}
				</Button>
				<Button
					className="h-14 flex-1 shrink-0 justify-between gap-3"
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
