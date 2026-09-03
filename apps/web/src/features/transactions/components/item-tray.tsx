import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	type ItemCartDisplayLine,
	resolveActiveItemId,
} from "@/features/transactions/cart/cart";
import { useCartOps } from "@/features/transactions/cart/useCart";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
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
		<fieldset className="pointer-events-auto flex min-w-0 gap-1 overflow-x-auto border-0 bg-background/40 p-1 backdrop-blur-xl">
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
							className="h-14 flex-col items-start gap-0.5 px-3 text-left"
							onClick={() => setActiveItem(item.line_id)}
							type="button"
							variant={isActive ? "default" : "outline"}
						>
							{/* Caption says what the number counts, so "Item 2" cannot be
							    misread as a quantity beside the treatment count. */}
							<span className="font-mono text-[10px] uppercase leading-none tracking-wide opacity-70">
								Item {itemNumber}
							</span>
							<span className="flex items-baseline gap-1.5 text-sm leading-none">
								<span className="max-w-36 truncate">
									{descriptors ?? "New item"}
								</span>
								<span className="text-xs opacity-70">
									{pluralize(item.services.length, "treatment")}
								</span>
							</span>
						</Button>
						{/* Only the card that was just opened by mistake can be closed
						    from here — one with lines is removed in the checkout sheet,
						    where those lines are in view. */}
						{isActive && isEmpty ? (
							<Button
								aria-label={`Remove item ${itemNumber}`}
								className="h-14 w-10 border-l-0"
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
				className="h-14 shrink-0 gap-1 px-3 text-sm"
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
