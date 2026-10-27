import { POSTServiceSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { CurrencyInput } from "@/components/form/currency-input";
import {
	SHEET_FORM_GRID,
	SheetFormActions,
} from "@/components/form/sheet-form-actions";
import { SwitchList, SwitchRow } from "@/components/form/switch-list";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CategoryAutocomplete } from "@/features/orders/components/category-autocomplete";
import { useSheetDirtyGuard } from "@/hooks/useSheetDirtyGuard";

const serviceFormResolverSchema = z
	.object({
		...POSTServiceSchema.shape,
		category_id: z.preprocess(
			(value) => Number(value),
			POSTServiceSchema.shape.category_id,
		),
		// The server parses money into a number for itself, but the API still takes
		// the digit string the currency field types out — keep the form in that shape.
		cogs: POSTServiceSchema.shape.cogs.transform(String),
		// "Dynamic Price" (ADR-0018, e.g. Repair) lives on the form only; the API
		// gets price: null.
		no_list_price: z.boolean(),
		price: z.string(),
	})
	.superRefine((values, ctx) => {
		if (!values.no_list_price && values.price.trim().length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["price"],
				message: "Price is required",
			});
		}
	});

export type ServiceFormState = z.infer<typeof serviceFormResolverSchema>;

// What leaves the form: the API payload shape, price already null for a
// no-list-price Service.
export type ServiceFormSubmitValues = Omit<
	ServiceFormState,
	"no_list_price" | "price"
> & { price: string | null };

const defaultForm: ServiceFormState = {
	category_id: 0,
	code: "",
	cogs: "",
	no_list_price: false,
	price: "",
	name: "",
	description: "",
	is_active: true,
	is_priority: false,
};

interface ServiceFormProps {
	defaultValues?: ServiceFormState;
	handleOnSubmit: (values: ServiceFormSubmitValues) => Promise<void> | void;
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
	const noListPrice = form.watch("no_list_price");

	return (
		<form
			onSubmit={form.handleSubmit(({ no_list_price, price, ...rest }) =>
				handleOnSubmit({ ...rest, price: no_list_price ? null : price }),
			)}
		>
			<FieldGroup className={SHEET_FORM_GRID}>
				<Controller
					control={form.control}
					name="category_id"
					render={({ field, fieldState }) => (
						<div className="col-span-full">
							<CategoryAutocomplete
								disabled={isSubmitting}
								error={fieldState.error}
								onValueChange={(value) => field.onChange(Number(value))}
								required
								value={field.value ? String(field.value) : ""}
							/>
						</div>
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
						<Field className="col-span-full" data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="service-description">Description</FieldLabel>
							<Input
								{...field}
								aria-invalid={fieldState.invalid}
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

				{noListPrice ? null : (
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
				)}

				<SwitchList>
					<Controller
						control={form.control}
						name="no_list_price"
						render={({ field }) => (
							<SwitchRow
								checked={field.value}
								description="Priced per Item (e.g. Repair). Enter the agreed price at drop-off, or leave it blank until inspection."
								disabled={isSubmitting}
								id="service-no-list-price"
								onCheckedChange={(checked) => {
									field.onChange(checked);
									if (checked) {
										form.setValue("price", "", { shouldValidate: true });
									}
								}}
								title="Dynamic Price"
							/>
						)}
					/>
					<Controller
						control={form.control}
						name="is_priority"
						render={({ field }) => (
							<SwitchRow
								checked={!!field.value}
								description="New lines of this Service start as Priority."
								disabled={isSubmitting}
								id="service-priority"
								onCheckedChange={field.onChange}
								title="Priority by default"
							/>
						)}
					/>
					<Controller
						control={form.control}
						name="is_active"
						render={({ field }) => (
							<SwitchRow
								checked={field.value}
								description="Only Active Services show in the POS."
								disabled={isSubmitting}
								id="service-active"
								onCheckedChange={field.onChange}
								title="Active"
							/>
						)}
					/>
				</SwitchList>

				<SheetFormActions
					addLabel="Add service"
					isEditing={isEditing}
					isSubmitting={isSubmitting}
					onCancel={onReset}
				/>
			</FieldGroup>
		</form>
	);
}
