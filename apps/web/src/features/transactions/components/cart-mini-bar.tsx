import {
	ArrowDown01Icon,
	ArrowUp01Icon,
	ShoppingCart01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { countCartTreatments } from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { CartLines } from "@/features/transactions/components/cart-lines";
import { ItemTray } from "@/features/transactions/components/item-tray";
import { formatMoney } from "@/shared/money";
import { pluralize } from "@/shared/utils";

interface CartMiniBarProps {
	onOpen: () => void;
}

export const CartMiniBar = ({ onOpen }: CartMiniBarProps) => {
	const { count, subtotal, itemRows } = useCart();
	const [isPeeking, setIsPeeking] = useState(false);
	// Services and Products only: the tray above already shows each Item, and
	// counting them again made the label too long for a phone (ADR-0017).
	const treatmentCount = countCartTreatments(itemRows);
	const productCount = count - treatmentCount;
	const summaryLabel = [
		treatmentCount > 0 ? pluralize(treatmentCount, "service") : null,
		productCount > 0 ? pluralize(productCount, "product") : null,
	]
		.filter(Boolean)
		.join(" · ");

	if (count === 0) {
		return null;
	}

	// The bar floats over the catalog, so each child is frosted: a clear one let
	// Service cards show through the text (bug B4). Gaps stay tappable.
	return (
		// min-w-0 here and on the button row, or a long label widens the whole
		// page past a phone's screen instead of truncating.
		<div className="pointer-events-none sticky bottom-0 z-40 grid min-w-0 gap-1 px-1">
			{/* Without the peek, dropping a mis-tapped line means typing a Customer
			    first; capped so an open Cart cannot bury the catalog. */}
			{isPeeking ? (
				<div className="pointer-events-auto max-h-[40dvh] overflow-y-auto overscroll-contain rounded-lg border border-border/70 bg-card/70 px-3 py-2 backdrop-blur-xl">
					<CartLines />
				</div>
			) : null}

			<ItemTray itemRows={itemRows} />

			<div className="pointer-events-auto flex min-w-0 gap-1 rounded-lg border border-border/70 bg-glass p-1 shadow-sm backdrop-blur-xl backdrop-saturate-[1.8]">
				{/* A mixed Cart's label is wider than a phone allows beside Check out;
				    a fixed share keeps "1 service" to "2 services" from sliding it. */}
				<Button
					aria-expanded={isPeeking}
					className="h-14 min-w-0 shrink basis-2/5 justify-start gap-2 bg-transparent"
					onClick={() => setIsPeeking((open) => !open)}
					size="lg"
					type="button"
					variant="outline"
				>
					<HugeiconsIcon icon={ShoppingCart01Icon} className="size-5" />
					<span className="min-w-0 truncate font-medium">{summaryLabel}</span>
					<HugeiconsIcon
						icon={isPeeking ? ArrowDown01Icon : ArrowUp01Icon}
						aria-hidden="true"
						className="size-4"
					/>
				</Button>
				<Button
					className="h-14 flex-1 shrink-0 justify-between gap-3 active:scale-100"
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
