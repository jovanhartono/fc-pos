import { XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { getServiceLinePrice } from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { getOrderServiceItemDescriptors } from "@/lib/order-service-item-details";
import { formatMoney, parseMoney } from "@/shared/money";

// Shared by the standing rail and the phone mini bar. Reads the cart itself
// rather than taking rows as props, so the two surfaces cannot show different
// lines or remove them differently. Callers gate on count and own the empty
// state — this renders nothing useful for an empty cart.
export const CartLines = () => {
	const { productRows, serviceRows, removeProduct, removeService } = useCart();

	return (
		<ul className="grid gap-2">
			{productRows.map((line) => (
				<li
					className="flex items-center gap-2 border-border/70 border-b border-dashed pb-2 last:border-b-0"
					key={`product-${line.id}`}
				>
					<span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
						<span className="min-w-0 truncate font-medium text-xs">
							{line.qty} × {line.product.name}
						</span>
						<span className="shrink-0 font-mono text-[11px] tabular-nums">
							{formatMoney(parseMoney(line.product.price) * line.qty)}
						</span>
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

			{serviceRows.map((line, index) => {
				const descriptors = getOrderServiceItemDescriptors(line);
				const isUnpriced =
					line.service.price === null && getServiceLinePrice(line) <= 0;

				return (
					<li
						className="flex items-center gap-2 border-border/70 border-b border-dashed pb-2 last:border-b-0"
						key={line.line_id}
					>
						<span className="grid min-w-0 flex-1 gap-1">
							<span className="flex items-baseline justify-between gap-2">
								<span className="min-w-0 truncate font-medium text-xs">
									{index + 1} · {line.service.name}
								</span>
								<span className="shrink-0 font-mono text-[11px] tabular-nums">
									{formatMoney(getServiceLinePrice(line))}
								</span>
							</span>
							<span className="flex flex-wrap gap-1">
								{descriptors.length > 0 ? (
									descriptors.map((value, valueIndex) => (
										<span
											className="border border-border/70 bg-background px-1.5 font-mono text-[10px] text-muted-foreground"
											key={`${valueIndex}-${value}`}
										>
											{value}
										</span>
									))
								) : (
									<span className="font-mono text-[10px] text-muted-foreground">
										No detail yet
									</span>
								)}
								{isUnpriced ? (
									<span className="border border-warning/50 bg-warning/10 px-1.5 font-mono text-[10px] text-warning">
										No price yet
									</span>
								) : null}
							</span>
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
				);
			})}
		</ul>
	);
};
