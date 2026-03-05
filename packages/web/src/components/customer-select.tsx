import { useQuery } from "@tanstack/react-query";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { fetchCustomers, queryKeys } from "@/lib/api";

type CustomerSelectProps = {
	id?: string;
	label?: string;
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	required?: boolean;
};

export function CustomerSelect({
	id = "customer-select",
	label = "Customer",
	value,
	onValueChange,
	disabled,
	required,
}: CustomerSelectProps) {
	const { data: customers = [], isPending } = useQuery({
		queryKey: queryKeys.customers,
		queryFn: fetchCustomers,
	});

	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>{label}</Label>
			<Combobox
				id={id}
				required={required}
				triggerClassName="h-10 w-full text-sm"
				options={customers.map((customer) => ({
					value: String(customer.id),
					label: `${customer.name} (${customer.phone_number})`,
				}))}
				value={value}
				onValueChange={onValueChange}
				loading={isPending}
				placeholder="Select customer"
				searchPlaceholder="Search customer..."
				emptyText="No customer found"
				disabled={disabled}
			/>
		</div>
	);
}
