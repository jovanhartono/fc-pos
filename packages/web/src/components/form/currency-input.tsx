import { MoneyIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatIDRCurrency, getNumericValue } from "@/shared/utils";

type CurrencyInputProps = {
	id: string;
	value: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	required?: boolean;
	className?: string;
};

export function CurrencyInput({
	id,
	value,
	onValueChange,
	placeholder = "Rp0",
	disabled,
	required,
	className,
}: CurrencyInputProps) {
	const displayValue = useMemo(() => formatIDRCurrency(value), [value]);

	return (
		<div className={cn("relative", className)}>
			<MoneyIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				id={id}
				type="text"
				inputMode="numeric"
				autoComplete="off"
				placeholder={placeholder}
				value={displayValue}
				onChange={(event) => onValueChange(getNumericValue(event.target.value))}
				disabled={disabled}
				required={required}
				className="h-10 pl-8"
			/>
		</div>
	);
}
