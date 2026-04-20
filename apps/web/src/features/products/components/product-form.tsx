import { POSTProductSchema } from "@fresclean/api/schema";
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

const productFormResolverSchema = z.object({
	...POSTProductSchema.shape,
	stock: z.preprocess((value) => Number(value), POSTProductSchema.shape.stock),
	category_id: z.preprocess(
		(value) => Number(value),
		POSTProductSchema.shape.category_id,
	),
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
			<FieldGroup>
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
								className="h-10"
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
								className="h-10"
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="category_id"
					control={form.control}
					render={({ field, fieldState }) => (
						<CategoryAutocomplete
							value={field.value ? String(field.value) : ""}
							onValueChange={(value) => field.onChange(Number(value))}
							required
							disabled={isSubmitting}
							error={fieldState.error}
						/>
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
								className="h-10"
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
								className="h-10"
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="description"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid} className="md:col-span-2">
							<FieldLabel htmlFor="product-description">Description</FieldLabel>
							<Input
								{...field}
								id="product-description"
								placeholder="e.g. 1L refill bottle"
								aria-invalid={fieldState.invalid}
								value={field.value ?? ""}
								disabled={isSubmitting}
								className="h-10"
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

				<Controller
					name="is_active"
					control={form.control}
					render={({ field }) => (
						<FieldLabel htmlFor="product-active" className="md:col-span-2">
							<Field orientation="horizontal">
								<FieldContent>
									<FieldTitle>Active</FieldTitle>
									<FieldDescription>
										Active products will be available throughout the app.
									</FieldDescription>
								</FieldContent>
								<Switch
									id="product-active"
									checked={field.value}
									onCheckedChange={(checked) => field.onChange(!!checked)}
									disabled={isSubmitting}
								/>
							</Field>
						</FieldLabel>
					)}
				/>

				<div className="flex flex-wrap gap-2 md:col-span-2 md:justify-end">
					{isEditing ? (
						<Button
							type="button"
							variant="outline"
							onClick={onReset}
							disabled={isSubmitting}
						>
							Cancel edit
						</Button>
					) : null}
					<Button
						type="submit"
						loading={isSubmitting}
						icon={<PlusIcon className="size-4" />}
					>
						{isEditing ? "Update Product" : "Create Product"}
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}
