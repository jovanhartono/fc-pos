// A guess at "time to reorder" until the shop names its own number.
const LOW_STOCK = 5;

interface ProductStockProps {
	stock: number;
}

// The admin scanning Products sees what to reorder before the counter runs
// out: amber when low, red when there is none to sell.
export const ProductStock = ({ stock }: ProductStockProps) => {
	if (stock <= 0) {
		return <span className="font-semibold text-destructive">Out of stock</span>;
	}
	if (stock <= LOW_STOCK) {
		return (
			<span className="font-semibold text-amber-600 tabular-nums dark:text-amber-400">
				{`${stock} left`}
			</span>
		);
	}
	return (
		<span className="font-semibold tabular-nums">
			{stock}
			{/* A phone card has no Stock header above the number. */}
			<span className="font-normal text-muted-foreground lg:hidden">
				{" in stock"}
			</span>
		</span>
	);
};
