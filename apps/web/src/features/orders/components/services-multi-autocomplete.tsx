import { CaretDownIcon, XIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { servicesQueryOptions } from "@/lib/query-options";
import { cn } from "@/lib/utils";

interface ServicesMultiAutocompleteProps {
	id?: string;
	label?: string;
	placeholder?: string;
	values: number[];
	onValuesChange: (values: number[]) => void;
	disabled?: boolean;
	error?: { message?: string };
}

export const ServicesMultiAutocomplete = ({
	id = "services-multi",
	label,
	placeholder = "Select services",
	values,
	onValuesChange,
	disabled,
	error,
}: ServicesMultiAutocompleteProps) => {
	const [isOpen, setIsOpen] = useState(false);

	const servicesQuery = useQuery(servicesQueryOptions());

	const services = servicesQuery.data ?? [];

	const valueSet = useMemo(() => new Set(values), [values]);

	const selectableServices = useMemo(
		() => services.filter((service) => service.is_active),
		[services],
	);

	const selectedServices = useMemo(
		() => selectableServices.filter((service) => valueSet.has(service.id)),
		[selectableServices, valueSet],
	);

	const handleToggle = useCallback(
		(serviceId: number) => {
			if (valueSet.has(serviceId)) {
				onValuesChange(values.filter((id) => id !== serviceId));
				return;
			}
			onValuesChange([...values, serviceId]);
		},
		[values, valueSet, onValuesChange],
	);

	const handleRemove = useCallback(
		(serviceId: number) => {
			onValuesChange(values.filter((id) => id !== serviceId));
		},
		[values, onValuesChange],
	);

	const hasSelection = selectedServices.length > 0;

	return (
		<Field data-invalid={!!error}>
			{label ? <FieldLabel htmlFor={id}>{label}</FieldLabel> : null}
			<Popover open={isOpen} onOpenChange={setIsOpen}>
				<PopoverTrigger
					nativeButton={false}
					render={
						<div
							id={id}
							role="combobox"
							aria-haspopup="listbox"
							aria-expanded={isOpen}
							tabIndex={disabled ? -1 : 0}
							aria-disabled={disabled}
							className={cn(
								"flex h-auto min-h-10 w-full cursor-pointer items-center justify-between gap-2 border border-input bg-background px-3 py-2 text-left text-sm",
								"aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
							)}
						/>
					}
				>
					<div className="flex flex-1 flex-wrap items-center gap-1.5">
						{hasSelection ? (
							selectedServices.map((service) => (
								<Badge
									key={service.id}
									variant="secondary"
									className="gap-1 pr-1"
								>
									{service.code}
									{!disabled ? (
										<button
											type="button"
											onClick={(event) => {
												event.stopPropagation();
												handleRemove(service.id);
											}}
											className="hover:text-destructive"
											aria-label={`Remove ${service.code}`}
										>
											<XIcon className="size-3" />
										</button>
									) : null}
								</Badge>
							))
						) : (
							<span className="text-muted-foreground">{placeholder}</span>
						)}
					</div>
					<CaretDownIcon className="size-4 shrink-0 opacity-50" />
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-(--radix-popover-trigger-width) max-h-72 overflow-y-auto p-0"
				>
					{selectableServices.length === 0 ? (
						<p className="p-3 text-muted-foreground text-sm">
							No services available
						</p>
					) : (
						<ul className="divide-y">
							{selectableServices.map((service) => {
								const isChecked = valueSet.has(service.id);
								return (
									<li key={service.id}>
										<Button
											type="button"
											variant="ghost"
											className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2 text-left"
											onClick={() => handleToggle(service.id)}
										>
											<Checkbox
												checked={isChecked}
												className="pointer-events-none"
												tabIndex={-1}
											/>
											<div className="flex flex-col">
												<span className="text-sm font-medium">
													{service.code}
												</span>
												<span className="text-muted-foreground text-xs">
													{service.name}
												</span>
											</div>
										</Button>
									</li>
								);
							})}
						</ul>
					)}
				</PopoverContent>
			</Popover>
			<FieldError errors={[error]} />
		</Field>
	);
};
