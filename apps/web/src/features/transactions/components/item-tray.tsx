import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	type ItemCartDisplayLine,
	resolveActiveItemId,
} from "@/features/transactions/cart/cart";
import { useCartOps } from "@/features/transactions/cart/useCart";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
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
export const ItemTray = ({ itemRows }: ItemTrayProps) => {
	const { setActiveItem, addItem } = useCartOps();
	const activeItemId = resolveActiveItemId(
		itemRows,
		useTransactionsPageStore((state) => state.activeItemId),
	);

	if (itemRows.length === 0) {
		return null;
	}

	return (
		<div className="pointer-events-auto flex gap-1 overflow-x-auto bg-background/40 p-1 backdrop-blur-xl">
			{itemRows.map((item, index) => {
				const isActive = item.line_id === activeItemId;
				const descriptors = getOrderServiceItemDetails(item);

				return (
					<Button
						aria-pressed={isActive}
						className="h-11 shrink-0 gap-1.5 px-3 text-sm"
						key={item.line_id}
						onClick={() => setActiveItem(item.line_id)}
						type="button"
						variant={isActive ? "default" : "outline"}
					>
						<span className="font-mono font-semibold tabular-nums">
							{index + 1}
						</span>
						<span className="max-w-32 truncate">
							{descriptors ?? "New item"}
						</span>
						<span className="font-mono text-xs tabular-nums opacity-70">
							{item.services.length}
						</span>
					</Button>
				);
			})}
			<Button
				className="h-11 shrink-0 gap-1 px-3 text-sm"
				icon={<PlusIcon className="size-4" />}
				onClick={addItem}
				type="button"
				variant="outline"
			>
				Item
			</Button>
		</div>
	);
};
