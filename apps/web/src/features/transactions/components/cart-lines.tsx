import { useCart } from "@/features/transactions/cart/useCart";
import { RemoveLineButton } from "@/features/transactions/components/remove-line-button";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";

// Rendered in the floating bar's peek. Reads the cart itself rather than
// taking rows as props — the same contract as the checkout's item rows, so no
// surface can show different lines or remove them differently. Callers gate on
// count and own the empty state — this renders nothing useful for an empty cart.
//
// Name only, no price: this list exists to verify and drop lines before
// checkout; the money lives there.
export const CartLines = () => {
	const { productRows, itemRows, removeProduct, removeService } = useCart();

	return (
		<ul className="grid gap-3">
			{/* One block per object, its treatments indented beneath, so the peek
			    reads "one shoe, three treatments" rather than three things the
			    customer only handed over once (ADR-0017). */}
			{itemRows.map((item, itemIndex) => (
				<li className="grid gap-1" key={item.line_id}>
					<p className="flex items-baseline gap-1.5 text-xs">
						<span className="font-mono uppercase tracking-wide text-muted-foreground">
							Item {itemIndex + 1}
						</span>
						<span className="min-w-0 truncate font-medium">
							{getOrderServiceItemDetails(item) ?? "New item"}
						</span>
					</p>
					<ul className="grid gap-1.5 border-border/70 border-l-2 pl-3">
						{item.services.length === 0 ? (
							<li className="text-muted-foreground text-xs">
								No treatments yet
							</li>
						) : null}
						{item.services.map((line) => (
							<li className="flex items-center gap-2" key={line.line_id}>
								<span className="min-w-0 flex-1 truncate text-xs">
									{line.service.name}
								</span>
								<RemoveLineButton
									label={`Remove ${line.service.name}`}
									onClick={() => removeService(item.line_id, line.line_id)}
								/>
							</li>
						))}
					</ul>
				</li>
			))}

			{productRows.length > 0 ? (
				<li className="grid gap-1">
					<p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
						Products
					</p>
					<ul className="grid gap-1.5 border-border/70 border-l-2 pl-3">
						{productRows.map((line) => (
							<li
								className="flex items-center gap-2"
								key={`product-${line.id}`}
							>
								<span className="min-w-0 flex-1 truncate text-xs">
									{line.qty} × {line.product.name}
								</span>
								<RemoveLineButton
									label={`Remove ${line.product.name}`}
									onClick={() => removeProduct(line.id)}
								/>
							</li>
						))}
					</ul>
				</li>
			) : null}
		</ul>
	);
};
