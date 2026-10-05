import { Button } from "@/components/ui/button";
import { useCart } from "@/features/transactions/cart/useCart";
import { CartLines } from "@/features/transactions/components/cart-lines";
import { ItemTray } from "@/features/transactions/components/item-tray";
import { formatMoney } from "@/shared/money";

interface CartColumnProps {
	onOpen: () => void;
}

// The iPad-landscape Cart: always beside the catalog, so the cashier sees which
// Item the next tap lands on and what it adds up to while upselling.
export const CartColumn = ({ onOpen }: CartColumnProps) => {
	const { count, subtotal, itemRows } = useCart();

	return (
		<aside
			aria-label="Cart"
			className="sticky top-0 flex max-h-[calc(100dvh-4rem)] min-h-0 flex-col border border-border/70 bg-card"
		>
			{itemRows.length > 0 ? (
				<div className="border-border/70 border-b">
					<ItemTray itemRows={itemRows} />
				</div>
			) : null}

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
				{count === 0 ? (
					<p className="py-6 text-center text-muted-foreground text-sm">
						Cart is empty.
					</p>
				) : (
					<CartLines showPrices />
				)}
			</div>

			<div className="border-border/70 border-t p-3">
				<Button
					className="h-14 w-full justify-between gap-3"
					disabled={count === 0}
					onClick={onOpen}
					size="lg"
					type="button"
				>
					<span className="font-semibold">{formatMoney(subtotal)}</span>
					<span className="font-medium">Check out</span>
				</Button>
			</div>
		</aside>
	);
};
