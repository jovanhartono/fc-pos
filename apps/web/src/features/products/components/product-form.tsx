import { POSTProductSchema } from "@fresclean/api/schema";
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

const productFormResolverSchema = z.object({
	...POSTProductSchema.shape,
	stock: z.preprocess((value) => Number(value), POSTProductSchema.shape.stock),
	category_id: z.preprocess(
		(value) => Number(value),
		POSTProductSchema.shape.category_id,
	),
	// The server parses money into a number for itself, but the API still takes
	// the digit string the currency field types out — keep the form in that shape.
	cogs: POSTProductSchema.shape.cogs.transform(String),
	price: POSTProductSchema.shape.price.transform(String),
});

export type ProductFormState = z.infer<typeof productFormResolverSchema>;

const defaultForm: ProductFormState = {
	name: "",
	description: "",
	is_active: true,
	sku: "",
	uom: "pcs",
	stock: 0,
	category_id: 0,
	cogs: "",
	price: "",
};

type ProductFormProps = {
	defaultValues?: ProductFormState;
	handleOnSubmit: (values: ProductFormState) => Promise<void> | void;
	isEditing: boolean;
	onReset: () => void;
};

export function ProductForm({
	defaultValues,
	handleOnSubmit,
	isEditing,
	onReset,
}: ProductFormProps) {
	const form = useForm({
		resolver: zodResolver(productFormResolverSchema),
		defaultValues: defaultValues ?? defaultForm,
	});
	useSheetDirtyGuard(form.formState.isDirty);
	const isSubmitting = form.formState.isSubmitting;

	return (
		<form onSubmit={form.handleSubmit(handleOnSubmit)}>
			<FieldGroup className={SHEET_FORM_GRID}>
				<Controller
					name="name"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="product-name" asterisk>
								Name
							</FieldLabel>
							<Input
								{...field}
								id="product-name"
								placeholder="e.g. Liquid Detergent"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="sku"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="product-sku" asterisk>
								SKU
							</FieldLabel>
							<Input
								{...field}
								id="product-sku"
								placeholder="e.g. PRD-001"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="category_id"
					control={form.control}
					render={({ field, fieldState }) => (
						<div className="col-span-full">
							<CategoryAutocomplete
								value={field.value ? String(field.value) : ""}
								onValueChange={(value) => field.onChange(Number(value))}
								required
								disabled={isSubmitting}
								error={fieldState.error}
							/>
						</div>
					)}
				/>

				<Controller
					name="uom"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="product-uom" asterisk>
								UOM
							</FieldLabel>
							<Input
								{...field}
								id="product-uom"
								placeholder="e.g. pcs"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="stock"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="product-stock" asterisk>
								Stock
							</FieldLabel>
							<Input
								id="product-stock"
								type="number"
								placeholder="e.g. 100"
								aria-invalid={fieldState.invalid}
								value={String(field.value)}
								onChange={(event) => field.onChange(Number(event.target.value))}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="description"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid} className="col-span-full">
							<FieldLabel htmlFor="product-description">Description</FieldLabel>
							<Input
								{...field}
								id="product-description"
								placeholder="e.g. 1L refill bottle"
								aria-invalid={fieldState.invalid}
								value={field.value ?? ""}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="cogs"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="product-cogs" asterisk>
								COGS
							</FieldLabel>
							<CurrencyInput
								id="product-cogs"
								placeholder="Rp0"
								value={field.value}
								onValueChange={field.onChange}
								disabled={isSubmitting}
								required
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="price"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="product-price" asterisk>
								Price
							</FieldLabel>
							<CurrencyInput
								id="product-price"
								placeholder="Rp0"
								value={field.value}
								onValueChange={field.onChange}
								disabled={isSubmitting}
								required
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<SwitchList>
					<Controller
						name="is_active"
						control={form.control}
						render={({ field }) => (
							<SwitchRow
								checked={field.value}
								disabled={isSubmitting}
								id="product-active"
								onCheckedChange={field.onChange}
								title="Active"
							/>
						)}
					/>
				</SwitchList>

				<SheetFormActions
					addLabel="Add product"
					isEditing={isEditing}
					isSubmitting={isSubmitting}
					onCancel={onReset}
				/>
			</FieldGroup>
		</form>
	);
}
