import { POSTOrderSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { CurrencyInput } from "@/components/form/currency-input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
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
import { Textarea } from "@/components/ui/textarea";
import { CampaignAutocomplete } from "@/features/orders/components/campaign-autocomplete";
import { CustomerAutocomplete } from "@/features/orders/components/customer-autocomplete";
import { PaymentMethodAutocomplete } from "@/features/orders/components/payment-method-autocomplete";
import { ProductAutocomplete } from "@/features/orders/components/product-autocomplete";
import { ServiceAutocomplete } from "@/features/orders/components/service-autocomplete";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import type { CreateOrderPayload } from "@/lib/api";
import { servicesQueryOptions } from "@/lib/query-options";

export type OrderFormState = {
	customer_id: string;
	store_id: string;
	campaign_id: string;
	payment_method_id: string;
	payment_status: "paid" | "unpaid";
	discount: string;
	notes: string;
	products: Array<{
		id: string;
		qty: string;
	}>;
	services: Array<{
		id: string;
		is_priority: boolean;
		brand: string;
		color: string;
		model: string;
		size: string;
	}>;
};

const defaultForm: OrderFormState = {
	customer_id: "",
	store_id: "",
	campaign_id: "",
	payment_method_id: "",
	payment_status: "unpaid",
	discount: "",
	notes: "",
	products: [{ id: "", qty: "1" }],
	services: [
		{
			id: "",
			is_priority: false,
			brand: "",
			color: "",
			model: "",
			size: "",
		},
	],
};

function toOrderPayload(values: OrderFormState): CreateOrderPayload {
	return {
		customer_id: Number(values.customer_id),
		store_id: Number(values.store_id),
		campaign_id: values.campaign_id ? Number(values.campaign_id) : undefined,
		products: values.products
			.filter((product) => !!product.id)
			.map((product) => ({
				id: Number(product.id),
				qty: Number(product.qty),
				notes: undefined,
			})),
		services: values.services
			.filter((service) => !!service.id)
			.map((service) => ({
				id: Number(service.id),
				is_priority: service.is_priority,
				brand: service.brand.trim() || undefined,
				color: service.color.trim() || undefined,
				model: service.model.trim() || undefined,
				size: service.size.trim() || undefined,
				notes: undefined,
			})),
		discount: values.discount || "0",
		payment_method_id: values.payment_method_id
			? Number(values.payment_method_id)
			: undefined,
		payment_status: values.payment_status,
		notes: values.notes || undefined,
	};
}

const orderFormResolverSchema = z
	.object({
		...POSTOrderSchema.shape,
		customer_id: z.string().trim().min(1, "Customer is required"),
		store_id: z.string().trim().min(1, "Store ID is required"),
		payment_method_id: z.string(),
		discount: z
			.string()
			.refine(
				(value) => value.trim() === "" || Number(value) > 0,
				"Discount must be positive",
			),
		campaign_id: z.string(),
		notes: z.string(),
		products: z.array(
			z.object({
				id: z.string(),
				qty: z.string(),
				notes: z.string().optional(),
			}),
		),
		services: z.array(
			z.object({
				id: z.string(),
				is_priority: z.boolean(),
				brand: z.string(),
				color: z.string(),
				model: z.string(),
				size: z.string(),
				notes: z.string().optional(),
			}),
		),
	})
	.superRefine((values, ctx) => {
		const parsed = POSTOrderSchema.safeParse(toOrderPayload(values));
		if (parsed.success) {
			return;
		}

		for (const issue of parsed.error.issues) {
			const issuePath = String(issue.path[0] ?? "");
			let path = issue.path;
			if (issuePath === "products_ids") {
				path = ["products", 0, "id"];
			}
			if (issuePath === "services_ids") {
				path = ["services", 0, "id"];
			}
			ctx.addIssue({
				code: "custom",
				path,
				message: issue.message,
			});
		}
	});

type OrderFormProps = {
	defaultValues?: OrderFormState;
	handleOnSubmit: (values: CreateOrderPayload) => Promise<void> | void;
	isSubmitting?: boolean;
	allowedStoreIds?: number[];
};

export function OrderForm({
	defaultValues,
	handleOnSubmit,
	allowedStoreIds,
}: OrderFormProps) {
	const servicesQuery = useQuery(servicesQueryOptions());
	const form = useForm({
		resolver: zodResolver(orderFormResolverSchema),
		defaultValues: defaultValues ?? defaultForm,
	});
	const isSubmitting = form.formState.isSubmitting;

	const productFields = useFieldArray({
		control: form.control,
		name: "products",
	});
	const serviceFields = useFieldArray({
		control: form.control,
		name: "services",
	});
	const services = servicesQuery.data ?? [];
	const selectedStoreId = useWatch({
		control: form.control,
		name: "store_id",
	});
	const watchedServices = useWatch({
		control: form.control,
		name: "services",
	});

	return (
		<form
			onSubmit={form.handleSubmit(async (values) => {
				await handleOnSubmit(toOrderPayload(values));
			})}
		>
			<FieldGroup className="md:grid md:grid-cols-2 md:gap-x-4">
				<Controller
					name="customer_id"
					control={form.control}
					render={({ field, fieldState }) => (
						<CustomerAutocomplete
							value={field.value}
							onValueChange={field.onChange}
							disabled={isSubmitting}
							required
							error={fieldState.error}
						/>
					)}
				/>

				<Controller
					name="store_id"
					control={form.control}
					render={({ field, fieldState }) => (
						<StoreAutocomplete
							value={field.value}
							onValueChange={field.onChange}
							allowedStoreIds={allowedStoreIds}
							disabled={isSubmitting}
							required
							error={fieldState.error}
						/>
					)}
				/>

				<Controller
					name="campaign_id"
					control={form.control}
					render={({ field, fieldState }) => (
						<CampaignAutocomplete
							value={field.value}
							storeId={selectedStoreId}
							onValueChange={field.onChange}
							disabled={isSubmitting}
							error={fieldState.error}
						/>
					)}
				/>

				<Controller
					name="payment_method_id"
					control={form.control}
					render={({ field, fieldState }) => (
						<PaymentMethodAutocomplete
							value={field.value}
							onValueChange={field.onChange}
							disabled={isSubmitting}
							error={fieldState.error}
						/>
					)}
				/>

				<Controller
					name="payment_status"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="order-payment-status" asterisk>
								Payment Status
							</FieldLabel>
							<Combobox
								id="order-payment-status"
								required
								triggerClassName="h-10 w-full text-sm"
								options={[
									{ value: "unpaid", label: "unpaid" },
									{ value: "paid", label: "paid" },
								]}
								value={field.value}
								onValueChange={(value) =>
									field.onChange(
										(value ?? "unpaid") as OrderFormState["payment_status"],
									)
								}
								placeholder="Select payment status"
								searchPlaceholder="Search payment status..."
								emptyText="No status found"
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<div className="grid gap-3 md:col-span-2">
					<div className="flex items-center justify-between">
						<FieldLabel>Products</FieldLabel>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={isSubmitting}
							onClick={() =>
								productFields.append({
									id: "",
									qty: "1",
								})
							}
						>
							Add Product
						</Button>
					</div>
					<FieldError
						errors={[form.formState.errors.products as { message?: string }]}
					/>
					{productFields.fields.map((item, index) => (
						<div key={item.id} className="grid gap-3 md:grid-cols-2">
							<Controller
								name={`products.${index}.id`}
								control={form.control}
								render={({ field, fieldState }) => (
									<ProductAutocomplete
										id={`order-product-${index}`}
										label={`Product ${index + 1} (optional)`}
										value={field.value}
										onValueChange={field.onChange}
										disabled={isSubmitting}
										error={fieldState.error}
									/>
								)}
							/>

							<Controller
								name={`products.${index}.qty`}
								control={form.control}
								render={({ field, fieldState }) => (
									<Field data-invalid={fieldState.invalid}>
										<FieldLabel htmlFor={`order-product-qty-${index}`}>
											Qty
										</FieldLabel>
										<Input
											{...field}
											id={`order-product-qty-${index}`}
											type="number"
											placeholder="e.g. 1"
											min={1}
											aria-invalid={fieldState.invalid}
											disabled={isSubmitting}
											className="h-10 w-full text-sm md:h-10"
										/>
										<FieldError errors={[fieldState.error]} />
									</Field>
								)}
							/>

							{productFields.fields.length > 1 ? (
								<div className="md:col-span-2 md:justify-self-end">
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={isSubmitting}
										onClick={() => productFields.remove(index)}
									>
										Remove
									</Button>
								</div>
							) : null}
						</div>
					))}
				</div>

				<div className="grid gap-3 md:col-span-2">
					<div className="flex items-center justify-between">
						<FieldLabel>Services</FieldLabel>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={isSubmitting}
							onClick={() =>
								serviceFields.append({
									id: "",
									is_priority: false,
									brand: "",
									color: "",
									model: "",
									size: "",
								})
							}
						>
							Add Service
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						Drop-off proof is one photo for the whole order, captured at the
						counter. Each service line can collect extra condition photos from
						order detail or the worker screen.
					</p>
					<FieldError
						errors={[form.formState.errors.services as { message?: string }]}
					/>
					{serviceFields.fields.map((item, index) => (
						<div key={item.id} className="grid gap-3 md:grid-cols-2">
							<Controller
								name={`services.${index}.id`}
								control={form.control}
								render={({ field, fieldState }) => (
									<ServiceAutocomplete
										id={`order-service-${index}`}
										label={`Service ${index + 1} (optional)`}
										value={field.value}
										onValueChange={(value) => {
											field.onChange(value);
											const selectedService = services.find(
												(service) => String(service.id) === value,
											);
											form.setValue(
												`services.${index}.is_priority`,
												selectedService?.is_priority ?? false,
											);
										}}
										disabled={isSubmitting}
										error={fieldState.error}
									/>
								)}
							/>

							<Controller
								name={`services.${index}.is_priority`}
								control={form.control}
								render={({ field }) => (
									<FieldLabel
										htmlFor={`order-service-priority-${index}`}
										className="md:col-span-2"
									>
										<Field orientation="horizontal">
											<FieldContent>
												<FieldTitle>Priority in Queue</FieldTitle>
												<FieldDescription>
													Priority items stay at the top of the worker Queue.
												</FieldDescription>
											</FieldContent>
											<Switch
												id={`order-service-priority-${index}`}
												checked={field.value}
												onCheckedChange={(checked) => field.onChange(!!checked)}
												disabled={isSubmitting || !watchedServices?.[index]?.id}
											/>
										</Field>
									</FieldLabel>
								)}
							/>

							<Controller
								name={`services.${index}.color`}
								control={form.control}
								render={({ field, fieldState }) => (
									<Field data-invalid={fieldState.invalid}>
										<FieldLabel htmlFor={`order-service-color-${index}`}>
											Color
										</FieldLabel>
										<Input
											{...field}
											id={`order-service-color-${index}`}
											placeholder="e.g. Black"
											aria-invalid={fieldState.invalid}
											disabled={isSubmitting}
											className="h-10 w-full text-sm md:h-10"
										/>
										<FieldError errors={[fieldState.error]} />
									</Field>
								)}
							/>

							<Controller
								name={`services.${index}.brand`}
								control={form.control}
								render={({ field, fieldState }) => (
									<Field data-invalid={fieldState.invalid}>
										<FieldLabel htmlFor={`order-service-brand-${index}`}>
											Brand
										</FieldLabel>
										<Input
											{...field}
											id={`order-service-brand-${index}`}
											placeholder="e.g. Adidas"
											aria-invalid={fieldState.invalid}
											disabled={isSubmitting}
											className="h-10 w-full text-sm md:h-10"
										/>
										<FieldError errors={[fieldState.error]} />
									</Field>
								)}
							/>

							<Controller
								name={`services.${index}.model`}
								control={form.control}
								render={({ field, fieldState }) => (
									<Field data-invalid={fieldState.invalid}>
										<FieldLabel htmlFor={`order-service-model-${index}`}>
											Model
										</FieldLabel>
										<Input
											{...field}
											id={`order-service-model-${index}`}
											placeholder="e.g. Yeezy"
											aria-invalid={fieldState.invalid}
											disabled={isSubmitting}
											className="h-10 w-full text-sm md:h-10"
										/>
										<FieldError errors={[fieldState.error]} />
									</Field>
								)}
							/>

							<Controller
								name={`services.${index}.size`}
								control={form.control}
								render={({ field, fieldState }) => (
									<Field data-invalid={fieldState.invalid}>
										<FieldLabel htmlFor={`order-service-size-${index}`}>
											Size
										</FieldLabel>
										<Input
											{...field}
											id={`order-service-size-${index}`}
											placeholder="e.g. 42"
											aria-invalid={fieldState.invalid}
											disabled={isSubmitting}
											className="h-10 w-full text-sm md:h-10"
										/>
										<FieldError errors={[fieldState.error]} />
									</Field>
								)}
							/>

							{serviceFields.fields.length > 1 ? (
								<div className="md:col-span-2 md:justify-self-end">
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={isSubmitting}
										onClick={() => serviceFields.remove(index)}
									>
										Remove
									</Button>
								</div>
							) : null}
						</div>
					))}
				</div>

				<Controller
					name="discount"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="order-discount">Discount</FieldLabel>
							<CurrencyInput
								id="order-discount"
								placeholder="Rp0"
								value={field.value ?? ""}
								onValueChange={field.onChange}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="notes"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid} className="md:col-span-2">
							<FieldLabel htmlFor="order-notes">Notes</FieldLabel>
							<Textarea
								{...field}
								id="order-notes"
								placeholder="e.g. Express service"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<div className="sticky bottom-0 z-10 -mx-2 flex border-t bg-background/95 px-2 pt-3 backdrop-blur md:col-span-2 md:justify-end">
					<Button
						type="submit"
						loading={isSubmitting}
						loadingText="Creating order..."
						icon={<PlusIcon className="size-4" />}
					>
						Create Order
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}
