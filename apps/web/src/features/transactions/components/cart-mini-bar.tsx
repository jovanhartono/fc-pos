import { CaretUpIcon, ShoppingCartIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useCartTotals } from "@/features/transactions/hooks/use-cart-totals";
import { formatIDRCurrency } from "@/shared/utils";

interface CartMiniBarProps {
	onOpen: () => void;
}

export const CartMiniBar = ({ onOpen }: CartMiniBarProps) => {
	const { cartCount, subtotal } = useCartTotals();

	if (cartCount === 0) {
		return null;
	}

	return (
		<div className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 py-1">
			<Button
				type="button"
				size="lg"
				className="h-14 w-full justify-between gap-3 shadow-lg"
				onClick={onOpen}
			>
				<span className="flex items-center gap-2">
					<ShoppingCartIcon className="size-5" />
					<span className="font-medium">
						{cartCount} {cartCount === 1 ? "item" : "items"}
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
