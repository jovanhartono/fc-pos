import { CaretUpIcon, ShoppingCartIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/features/transactions/cart/useCart";
import { formatIDRCurrency } from "@/shared/utils";

interface CartMiniBarProps {
	hasStore: boolean;
	onOpen: () => void;
}

export const CartMiniBar = ({ hasStore, onOpen }: CartMiniBarProps) => {
	const { count, subtotal } = useCart();

	if (count === 0) {
		return null;
	}

	return (
		<div className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 grid gap-1 py-1">
			{/* Says up front why the bar won't open, so the block isn't a dead-end
			    tap. The tap still explains itself and offers the way back. */}
			{hasStore ? null : (
				<p className="text-muted-foreground text-xs">
					Select a store to check out.
				</p>
			)}
			<Button
				type="button"
				size="lg"
				className="h-14 w-full justify-between gap-3"
				onClick={onOpen}
			>
				<span className="flex items-center gap-2">
					<ShoppingCartIcon className="size-5" />
					<span className="font-medium">
						{count} {count === 1 ? "item" : "items"}
					</span>
				</span>
				<span className="flex items-center gap-2">
					<span className="font-semibold">
						{formatIDRCurrency(String(subtotal))}
					</span>
					<CaretUpIcon className="size-4" />
				</span>
			</Button>
		</div>
	);
};
