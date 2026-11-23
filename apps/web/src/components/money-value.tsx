import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

interface MoneyValueProps {
  value: string | number | null | undefined;
  className?: string;
}

// A price in a list, printed the same way as the Order view's totals.
export const MoneyValue = ({ value, className }: MoneyValueProps) => (
  <span className={cn("font-medium whitespace-nowrap tabular-nums", className)}>
    {formatMoney(value)}
  </span>
);
