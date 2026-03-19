import { PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { CustomerSheetContent } from "@/features/customers/components/customer-sheet-content";
import { fetchCustomersPage } from "@/lib/api";
import { useSheet } from "@/stores/sheet-store";

type CustomerAutocompleteProps = {
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	required?: boolean;
	error?: { message?: string };
};

export function CustomerAutocomplete({
	value,
	onValueChange,
	disabled,
	required,
	error,
}: CustomerAutocompleteProps) {
	const [searchValue, setSearchValue] = useState("");
	const [debouncedSearchValue, setDebouncedSearchValue] = useState(searchValue);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			setDebouncedSearchValue(searchValue);
		}, 300);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [searchValue]);

	const { data, isPending } = useQuery({
		queryKey: ["customers-autocomplete", debouncedSearchValue],
		queryFn: () =>
			fetchCustomersPage({ limit: 50, search: debouncedSearchValue }),
	});

	const customers = useMemo(() => data?.items ?? [], [data?.items]);

	const { openSheet } = useSheet();

	const handleOpenCreateCustomer = useCallback(() => {
		openSheet({
			title: "Add Customer",
			description: "Create a new customer record",
			content: (
				<CustomerSheetContent
					onSuccess={(newCustomer) => {
						onValueChange(String(newCustomer.id));
					}}
				/>
			),
		});
	}, [openSheet, onValueChange]);

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor="order-customer" asterisk={required}>
				Customer Reference
			</FieldLabel>
			<div className="flex items-center gap-2">
				<div className="flex-1">
					<Combobox
						id="order-customer"
						required={required}
						triggerClassName="h-10 w-full text-sm"
						options={customers.map((customer) => ({
							value: String(customer.id),
							label: `${customer.name} ${customer.phone_number}`,
						}))}
						value={value}
						onValueChange={onValueChange}
						onInputChange={setSearchValue}
						loading={isPending}
						placeholder="Select customer"
						searchPlaceholder="Search customer..."
						emptyText="No customer found"
						disabled={disabled}
					/>
				</div>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="h-10 w-10 shrink-0"
					onClick={handleOpenCreateCustomer}
					disabled={disabled}
					icon={<PlusIcon className="size-4" />}
				/>
			</div>
			<FieldError errors={[error]} />
		</Field>
	);
}
