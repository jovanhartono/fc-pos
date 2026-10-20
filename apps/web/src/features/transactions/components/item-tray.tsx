import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	type ItemCartDisplayLine,
	resolveActiveItemId,
} from "@/features/transactions/cart/cart";
import { useCartOps } from "@/features/transactions/cart/useCart";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { cn } from "@/lib/utils";
import { pluralize } from "@/shared/utils";
import { useTransactionsPageStore } from "@/stores/transactions-store";

interface ItemTrayProps {
	// Handed down from the mini bar, which already derives the cart for its own
	// label — a second useCart() here would run the whole derivation chain twice
	// on every catalog tap. Ops come from useCartOps for the same reason: it
	// subscribes to nothing.
	itemRows: ItemCartDisplayLine[];
}

// The pointer a catalog tap lands on, made visible on the screen where the
// tapping happens. Without it, three shoes each needing a Deep Clean became
// one shoe with three Deep Cleans: the only "+ item" lived two steps into the
// checkout sheet, so the natural gesture produced the wrong order (ADR-0017).
// This is also the only place the pointer is chosen — the checkout sheet has
// no catalog in view, so a marker there had nothing to point at.
export const ItemTray = ({ itemRows }: ItemTrayProps) => {
	const { setActiveItem, addItem, removeItem } = useCartOps();
	const activeItemId = resolveActiveItemId(
		itemRows,
		useTransactionsPageStore((state) => state.activeItemId),
	);

	if (itemRows.length === 0) {
		return null;
	}

	return (
		<fieldset className="pointer-events-auto flex w-fit min-w-0 max-w-full gap-1 overflow-x-auto rounded-lg border border-border/70 bg-glass p-1 shadow-sm backdrop-blur-xl backdrop-saturate-[1.8]">
			<legend className="sr-only">Items on the counter</legend>
			{itemRows.map((item, index) => {
				const isActive = item.line_id === activeItemId;
				const isEmpty = item.services.length === 0;
				const descriptors = getOrderServiceItemDetails(item);
				const itemNumber = index + 1;

				return (
					<span className="flex shrink-0" key={item.line_id}>
						<Button
							aria-pressed={isActive}
							className={cn(
								"h-14 pointer-coarse:h-14 flex-col items-start gap-0.5 px-3 text-left",
								isActive && isEmpty && "rounded-r-none",
							)}
							onClick={() => setActiveItem(item.line_id)}
							type="button"
							variant={isActive ? "default" : "outline"}
						>
							{/* Caption says what the number counts, so "Item 2" cannot be
							    misread as a quantity beside the treatment count. */}
							<span className="text-caption font-medium leading-none opacity-70">
								Item {itemNumber}
							</span>
							<span className="flex items-baseline gap-1.5 text-body leading-none">
								<span className="max-w-36 truncate">
									{descriptors ?? "New item"}
								</span>
								{/* Room for "9 services", so a tap that adds one doesn't
								    widen the chip and push + Item along. */}
								<span className="min-w-[8ch] text-footnote opacity-70">
									{pluralize(item.services.length, "service")}
								</span>
							</span>
						</Button>
						{/* Only the card that was just opened by mistake can be closed
						    from here — one with lines is removed in the checkout sheet,
						    where those lines are in view. */}
						{isActive && isEmpty ? (
							<Button
								aria-label={`Remove item ${itemNumber}`}
								className="h-14 pointer-coarse:h-14 w-10 rounded-l-none border-l-0"
								icon={<XIcon className="size-4" />}
								onClick={() => removeItem(item.line_id)}
								type="button"
								variant="outline"
							/>
						) : null}
					</span>
				);
			})}
			<Button
				className="h-14 pointer-coarse:h-14 shrink-0 gap-1 px-3 text-body"
				icon={<PlusIcon className="size-4" />}
				onClick={addItem}
				type="button"
				variant="outline"
			>
				Item
			</Button>
		</fieldset>
	);
};
