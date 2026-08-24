import { XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/features/transactions/cart/useCart";

// Shared by the standing rail and the phone mini bar. Reads the cart itself
// rather than taking rows as props, so the two surfaces cannot show different
// lines or remove them differently. Callers gate on count and own the empty
// state — this renders nothing useful for an empty cart.
//
// Name only, no price or descriptors: this list exists to verify and drop
// lines before checkout; the money and the item details live there.
export const CartLines = () => {
	const { productRows, serviceRows, removeProduct, removeService } = useCart();

	return (
		<ul className="grid gap-2">
			{productRows.map((line) => (
				<li
					className="flex items-center gap-2 border-border/70 border-b border-dashed pb-2 last:border-b-0"
					key={`product-${line.id}`}
				>
					<span className="min-w-0 flex-1 truncate font-medium text-xs">
						{line.qty} × {line.product.name}
					</span>
					<Button
						aria-label={`Remove ${line.product.name}`}
						className="size-11 shrink-0"
						icon={<XIcon className="size-4" />}
						onClick={() => removeProduct(line.id)}
						size="icon-xs"
						type="button"
						variant="outline"
					/>
				</li>
			))}

			{serviceRows.map((line, index) => (
				<li
					className="flex items-center gap-2 border-border/70 border-b border-dashed pb-2 last:border-b-0"
					key={line.line_id}
				>
					<span className="min-w-0 flex-1 truncate font-medium text-xs">
						{index + 1} · {line.service.name}
					</span>
					<Button
						aria-label={`Remove ${line.service.name}`}
						className="size-11 shrink-0"
						icon={<XIcon className="size-4" />}
						onClick={() => removeService(line.line_id)}
						size="icon-xs"
						type="button"
						variant="outline"
					/>
				</li>
			))}
		</ul>
	);
};
