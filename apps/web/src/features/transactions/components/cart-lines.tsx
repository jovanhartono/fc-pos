import { useCart } from "@/features/transactions/cart/useCart";
import { RemoveLineButton } from "@/features/transactions/components/remove-line-button";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";

// The floating bar's peek: names only, no price, for checking and dropping lines
// before checkout, where the money lives. Callers own the empty state.
export const CartLines = () => {
	const { productRows, itemRows, removeProduct, removeService } = useCart();

	return (
		<ul className="grid gap-3">
			{/* One block per Item, its Services beneath, so an upsold shoe reads as
			    one shoe, not three (ADR-0017). */}
			{itemRows.map((item, itemIndex) => (
				<li className="grid gap-1" key={item.line_id}>
					<p className="flex items-baseline gap-1.5 text-footnote">
						<span className="text-subhead font-medium text-muted-foreground">
							Item {itemIndex + 1}
						</span>
						<span className="min-w-0 truncate font-medium">
							{getOrderServiceItemDetails(item) ?? "New item"}
						</span>
					</p>
					<ul className="grid gap-1.5 border-border/70 border-l-2 pl-3">
						{item.services.length === 0 ? (
							<li className="text-muted-foreground text-footnote">
								No Services yet
							</li>
						) : null}
						{item.services.map((line) => (
							<li className="flex items-center gap-2" key={line.line_id}>
								<span className="min-w-0 flex-1 truncate text-footnote">
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
					<p className="text-subhead font-medium text-muted-foreground">
						Products
					</p>
					<ul className="grid gap-1.5 border-border/70 border-l-2 pl-3">
						{productRows.map((line) => (
							<li
								className="flex items-center gap-2"
								key={`product-${line.id}`}
							>
								<span className="min-w-0 flex-1 truncate text-footnote">
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
