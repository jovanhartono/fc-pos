import { cn } from "@/lib/utils";
import { formatMoneyParts } from "@/shared/money";

interface MoneyValueProps {
	value: string | number | null | undefined;
	className?: string;
}

// A price in a list: bold amount, small dimmed Rp. The Rp takes the amount's
// colour, so a green discount keeps a green Rp.
export const MoneyValue = ({ value, className }: MoneyValueProps) => {
	const { currency, amount } = formatMoneyParts(value);
	return (
		<span className={cn("font-semibold tabular-nums", className)}>
			<span className="mr-0.5 font-medium text-[0.75em] opacity-60">
				{currency}
			</span>
			{amount}
		</span>
	);
};
