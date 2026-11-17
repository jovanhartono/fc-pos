import type { DiscountPreviewRow } from "@/features/transactions/lib/discount-preview";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

interface DiscountPreviewRowsProps {
	rows: DiscountPreviewRow[];
}

// Rows of a <dl> the caller draws, so each screen keeps its own spacing.
export const DiscountPreviewRows = ({ rows }: DiscountPreviewRowsProps) =>
	rows.map((row) => (
		<div
			className="flex items-center justify-between gap-3 text-body"
			key={row.key}
		>
			<dt className="text-muted-foreground">{row.label}</dt>
			<dd
				className={cn(
					"font-medium tabular-nums",
					row.isDiscount && "text-destructive",
				)}
			>
				{row.isDiscount ? "-" : null}
				{formatMoney(row.amount)}
			</dd>
		</div>
	));
