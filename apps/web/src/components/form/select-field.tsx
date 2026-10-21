import type { ReactNode } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type SelectFieldItems =
	| Record<string, ReactNode>
	| ReadonlyArray<{ value: string; label: ReactNode }>;

interface SelectFieldProps {
	items: SelectFieldItems;
	value: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	size?: "sm" | "default" | "md" | "lg";
	className?: string;
	id?: string;
	disabled?: boolean;
	"aria-label"?: string;
}

// `items` feeds both the options and the closed control, so it shows the label,
// not the raw value, before the popup has ever opened.
export const SelectField = ({
	items,
	value,
	onValueChange,
	placeholder,
	size = "md",
	className,
	id,
	disabled,
	"aria-label": ariaLabel,
}: SelectFieldProps) => {
	const entries = Array.isArray(items)
		? items
		: Object.entries(items).map(([entryValue, label]) => ({
				value: entryValue,
				label,
			}));

	// On the iPad pickers (`lg`) each option grows to 44px so a cashier can tap it;
	// the shared SelectItem stays dense for tables and filters.
	const itemClassName = size === "lg" ? "min-h-11 py-2.5 text-body" : undefined;

	return (
		<Select
			items={items}
			value={value}
			onValueChange={onValueChange}
			disabled={disabled}
		>
			<SelectTrigger
				id={id}
				size={size}
				className={className}
				aria-label={ariaLabel}
			>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{entries.map((entry) => (
					<SelectItem
						key={entry.value}
						value={entry.value}
						className={itemClassName}
					>
						{entry.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
};
