import { POSTServiceSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { CurrencyInput } from "@/components/form/currency-input";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CategoryAutocomplete } from "@/features/orders/components/category-autocomplete";
import { useSheetDirtyGuard } from "@/hooks/useSheetDirtyGuard";

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
	is_priority: false,
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
	useSheetDirtyGuard(form.formState.isDirty);

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
							<FieldLabel htmlFor="service-code" asterisk>
								Code
							</FieldLabel>
							<Input
								{...field}
								aria-invalid={fieldState.invalid}
								className="h-10"
								disabled={isSubmitting}
								id="service-code"
								placeholder="e.g. SVC-001"
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
							<FieldLabel htmlFor="service-name" asterisk>
								Name
							</FieldLabel>
							<Input
								{...field}
								aria-invalid={fieldState.invalid}
								className="h-10"
								disabled={isSubmitting}
								id="service-name"
								placeholder="e.g. Dry Clean Premium"
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
							<FieldLabel htmlFor="service-cogs" asterisk>
								COGS
							</FieldLabel>
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
							<FieldLabel htmlFor="service-price" asterisk>
								Price
							</FieldLabel>
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
					name="is_priority"
					render={({ field }) => (
						<FieldLabel htmlFor="service-priority" className="md:col-span-2">
							<Field orientation="horizontal">
								<FieldContent>
									<FieldTitle>Priority by default</FieldTitle>
									<FieldDescription>
										New shoe-service items created from this service will enter
										the Queue as priority by default.
									</FieldDescription>
								</FieldContent>
								<Switch
									checked={field.value}
									disabled={isSubmitting}
									id="service-priority"
									onCheckedChange={(checked) => field.onChange(!!checked)}
								/>
							</Field>
						</FieldLabel>
					)}
				/>

				<Controller
					control={form.control}
					name="is_active"
					render={({ field }) => (
						<FieldLabel htmlFor="service-active" className="md:col-span-2">
							<Field orientation="horizontal">
								<FieldContent>
									<FieldTitle>Active</FieldTitle>
									<FieldDescription>
										Active services can be selected when creating orders.
									</FieldDescription>
								</FieldContent>
								<Switch
									checked={field.value}
									disabled={isSubmitting}
									id="service-active"
									onCheckedChange={(checked) => field.onChange(!!checked)}
								/>
							</Field>
						</FieldLabel>
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
						icon={<PlusIcon className="size-4" />}
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
