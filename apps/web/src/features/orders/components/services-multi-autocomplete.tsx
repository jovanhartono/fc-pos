import { ArrowDown01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { type Service, servicesQueries } from "@/features/services/api";
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

interface SelectedServiceBadgesProps {
	services: Service[];
	valueSet: Set<number>;
	placeholder: string;
	disabled?: boolean;
	onRemove: (serviceId: number) => void;
}

const SelectedServiceBadges = ({
	services,
	valueSet,
	placeholder,
	disabled,
	onRemove,
}: SelectedServiceBadgesProps) => {
	const selectedServices = services.filter((service) =>
		valueSet.has(service.id),
	);

	const hasSelection = selectedServices.length > 0;

	return (
		<div className="flex flex-1 flex-wrap items-center gap-1.5">
			{hasSelection ? (
				selectedServices.map((service) => (
					<Badge key={service.id} variant="secondary" className="gap-1 pr-1">
						{service.code}
						{!disabled ? (
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onRemove(service.id);
								}}
								className="hover:text-destructive"
								aria-label={`Remove ${service.code}`}
							>
								<HugeiconsIcon icon={Cancel01Icon} className="size-3" />
							</button>
						) : null}
					</Badge>
				))
			) : (
				<span className="text-muted-foreground">{placeholder}</span>
			)}
		</div>
	);
};

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

	const servicesQuery = useQuery(servicesQueries.list());
	const selectableServices = (servicesQuery.data ?? []).filter(
		(service) => service.is_active,
	);

	const valueSet = new Set(values);

	const handleToggle = (serviceId: number) => {
		if (valueSet.has(serviceId)) {
			onValuesChange(values.filter((id) => id !== serviceId));
			return;
		}
		onValuesChange([...values, serviceId]);
	};

	const handleRemove = (serviceId: number) => {
		onValuesChange(values.filter((id) => id !== serviceId));
	};

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
								"flex h-auto min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-sm border border-input bg-background px-3 py-2 text-left text-body",
								"aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
							)}
						/>
					}
				>
					<SelectedServiceBadges
						services={selectableServices}
						valueSet={valueSet}
						placeholder={placeholder}
						disabled={disabled}
						onRemove={handleRemove}
					/>
					<HugeiconsIcon
						icon={ArrowDown01Icon}
						className="size-4 shrink-0 opacity-50"
					/>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-(--anchor-width) max-h-72 overflow-y-auto p-0"
				>
					{selectableServices.length === 0 ? (
						<p className="p-3 text-muted-foreground text-body">
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
												<span className="text-body font-medium">
													{service.code}
												</span>
												<span className="text-muted-foreground text-footnote">
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
