import { useQuery } from "@tanstack/react-query";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { storesQueries } from "@/features/stores/api";
import { cn } from "@/lib/utils";

interface StoreSelectProps {
	value: string;
	onValueChange: (value: string) => void;
	allowedStoreIds?: number[];
	disabled?: boolean;
	required?: boolean;
	label?: string;
	hideLabel?: boolean;
	id?: string;
	error?: { message?: string };
	placeholder?: string;
	triggerClassName?: string;
	allOptionLabel?: string;
}

export const StoreSelect = ({
	value,
	onValueChange,
	allowedStoreIds,
	disabled,
	required,
	label = "Store",
	hideLabel = false,
	id = "order-store",
	error,
	placeholder = "Select store",
	triggerClassName,
	allOptionLabel,
}: StoreSelectProps) => {
	const { data: stores = [] } = useQuery(storesQueries.list());
	const filteredStores = allowedStoreIds
		? stores.filter((store) => allowedStoreIds.includes(store.id))
		: stores;

	const options = filteredStores.map((store) => ({
		value: String(store.id),
		label: `${store.code} - ${store.name}`,
	}));
	if (allOptionLabel) {
		options.unshift({ value: "", label: allOptionLabel });
	}

	const select = (
		<Select
			value={value}
			onValueChange={onValueChange}
			disabled={disabled}
			required={required}
		>
			<SelectTrigger
				id={id}
				className={cn(
					"w-full",
					allOptionLabel && "data-placeholder:text-foreground",
					triggerClassName,
				)}
			>
				<SelectValue>
					{(current: string) =>
						options.find((option) => option.value === current)?.label ??
						placeholder
					}
				</SelectValue>
			</SelectTrigger>
			<SelectContent className="w-max min-w-(--anchor-width) max-w-(--available-width)">
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);

	if (hideLabel) {
		return select;
	}

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor={id} asterisk={required}>
				{label}
			</FieldLabel>
			<div>{select}</div>
			<FieldError errors={[error]} />
		</Field>
	);
};
