import { POSTServiceSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { CurrencyInput } from "@/components/form/currency-input";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CategoryAutocomplete } from "@/features/orders/components/category-autocomplete";

const serviceFormResolverSchema = z.object({
	...POSTServiceSchema.shape,
	category_id: z.preprocess(
		(value) => Number(value),
		POSTServiceSchema.shape.category_id,
	),
});

export type ServiceFormState = z.infer<typeof serviceFormResolverSchema>;

const defaultForm: ServiceFormState = {
	category_id: 0,
	code: "",
	cogs: "",
	price: "",
	name: "",
	description: "",
	is_active: true,
};

interface ServiceFormProps {
	defaultValues?: ServiceFormState;
	handleOnSubmit: (values: ServiceFormState) => Promise<void> | void;
	isEditing: boolean;
	onReset: () => void;
}

export function ServiceForm({
	defaultValues,
	handleOnSubmit,
	isEditing,
	onReset,
}: ServiceFormProps) {
	const form = useForm({
		resolver: zodResolver(serviceFormResolverSchema),
		defaultValues: defaultValues ?? defaultForm,
	});
	const isSubmitting = form.formState.isSubmitting;

	return (
		<form onSubmit={form.handleSubmit(handleOnSubmit)}>
			<FieldGroup>
				<Controller
					control={form.control}
					name="category_id"
					render={({ field, fieldState }) => (
						<CategoryAutocomplete
							disabled={isSubmitting}
							error={fieldState.error}
							onValueChange={(value) => field.onChange(Number(value))}
							required
							value={field.value ? String(field.value) : ""}
						/>
					)}
				/>

				<Controller
					control={form.control}
					name="code"
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="service-code">Code</FieldLabel>
							<Input
								{...field}
								aria-invalid={fieldState.invalid}
								className="h-10"
								disabled={isSubmitting}
								id="service-code"
								placeholder="e.g. SVC-001"
								required
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					control={form.control}
					name="name"
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="service-name">Name</FieldLabel>
							<Input
								{...field}
								aria-invalid={fieldState.invalid}
								className="h-10"
								disabled={isSubmitting}
								id="service-name"
								placeholder="e.g. Dry Clean Premium"
								required
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					control={form.control}
					name="description"
					render={({ field, fieldState }) => (
						<Field className="md:col-span-2" data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="service-description">Description</FieldLabel>
							<Input
								{...field}
								aria-invalid={fieldState.invalid}
								className="h-10"
								disabled={isSubmitting}
								id="service-description"
								placeholder="e.g. 24-hour turnaround"
								value={field.value ?? ""}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					control={form.control}
					name="cogs"
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="service-cogs">COGS</FieldLabel>
							<CurrencyInput
								disabled={isSubmitting}
								id="service-cogs"
								onValueChange={field.onChange}
								placeholder="Rp0"
								required
								value={field.value}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					control={form.control}
					name="price"
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="service-price">Price</FieldLabel>
							<CurrencyInput
								disabled={isSubmitting}
								id="service-price"
								onValueChange={field.onChange}
								placeholder="Rp0"
								required
								value={field.value}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					control={form.control}
					name="is_active"
					render={({ field }) => (
						<Field className="flex-row items-center justify-between md:col-span-2">
							<FieldLabel htmlFor="service-active">Active</FieldLabel>
							<Switch
								checked={field.value}
								disabled={isSubmitting}
								id="service-active"
								onCheckedChange={(checked) => field.onChange(!!checked)}
							/>
						</Field>
					)}
				/>

				<div className="flex flex-wrap gap-2 md:col-span-2 md:justify-end">
					{isEditing ? (
						<Button
							disabled={isSubmitting}
							onClick={onReset}
							type="button"
							variant="outline"
						>
							Cancel edit
						</Button>
					) : null}
					<Button
						icon={<PlusIcon className="size-4" weight="duotone" />}
						loading={isSubmitting}
						type="submit"
					>
						{isEditing ? "Update Service" : "Create Service"}
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}
