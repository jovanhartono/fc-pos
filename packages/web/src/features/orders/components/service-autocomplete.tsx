import { useQuery } from "@tanstack/react-query";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { fetchServices, queryKeys } from "@/lib/api";

type ServiceAutocompleteProps = {
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	error?: { message?: string };
};

export function ServiceAutocomplete({
	value,
	onValueChange,
	disabled,
	error,
}: ServiceAutocompleteProps) {
	const { data: services = [], isPending } = useQuery({
		queryKey: queryKeys.services,
		queryFn: fetchServices,
	});

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor="order-service">Service (optional)</FieldLabel>
			<Combobox
				id="order-service"
				triggerClassName="h-10 w-full text-sm"
				options={[
					{ value: "none", label: "No service" },
					...services.map((service) => ({
						value: String(service.id),
						label: service.name,
					})),
				]}
				value={value || "none"}
				onValueChange={(nextValue) =>
					onValueChange(!nextValue || nextValue === "none" ? "" : nextValue)
				}
				loading={isPending}
				placeholder="No service"
				searchPlaceholder="Search service..."
				emptyText="No service found"
				disabled={disabled}
			/>
			<FieldError errors={[error]} />
		</Field>
	);
}
