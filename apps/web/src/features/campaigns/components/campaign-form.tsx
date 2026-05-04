import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
import {
	Controller,
	FormProvider,
	useForm,
	useFormContext,
	useWatch,
} from "react-hook-form";
import { z } from "zod";
import { CurrencyInput } from "@/components/form/currency-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
	FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ServicesMultiAutocomplete } from "@/features/orders/components/services-multi-autocomplete";
import { useSheetDirtyGuard } from "@/hooks/useSheetDirtyGuard";
import type { CampaignPayload } from "@/lib/api";

const campaignFormSchema = z
	.object({
		code: z.string().trim().min(1, "Code is required"),
		name: z.string().trim().min(1, "Name is required"),
		discount_type: z.enum(["fixed", "percentage", "buy_n_get_m_free"]),
		discount_value: z.string(),
		min_order_total: z.string().min(1, "Min order total is required"),
		max_discount: z.string().optional(),
		starts_at: z.string().optional(),
		ends_at: z.string().optional(),
		is_active: z.boolean(),
		store_ids: z.array(z.number().int().positive()),
		eligible_service_ids: z.array(z.number().int().positive()),
		buy_quantity: z.number().int().min(1).optional(),
		free_quantity: z.number().int().min(1).optional(),
	})
	.superRefine((value, ctx) => {
		if (value.discount_type === "buy_n_get_m_free") {
			if (value.eligible_service_ids.length < 1) {
				ctx.addIssue({
					code: "custom",
					path: ["eligible_service_ids"],
					message: "Select at least one eligible service",
				});
			}
			if (!value.buy_quantity || value.buy_quantity < 1) {
				ctx.addIssue({
					code: "custom",
					path: ["buy_quantity"],
					message: "Buy quantity is required",
				});
			}
			if (!value.free_quantity || value.free_quantity < 1) {
				ctx.addIssue({
					code: "custom",
					path: ["free_quantity"],
					message: "Free quantity is required",
				});
			}
			return;
		}

		if (!value.discount_value || value.discount_value.trim().length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["discount_value"],
				message: "Discount value is required",
			});
		}
	});

export type CampaignFormState = z.infer<typeof campaignFormSchema>;

type CampaignDiscountType = CampaignFormState["discount_type"];

type CampaignFormProps = {
	defaultValues: CampaignFormState;
	stores: Array<{ id: number; name: string; code: string }>;
	handleOnSubmit: (values: CampaignPayload) => Promise<void> | void;
	isEditing: boolean;
	onReset: () => void;
};

function toCampaignPayload(values: CampaignFormState): CampaignPayload {
	const base = {
		code: values.code,
		name: values.name,
		min_order_total: values.min_order_total,
		starts_at: values.starts_at ? new Date(values.starts_at) : null,
		ends_at: values.ends_at ? new Date(values.ends_at) : null,
		is_active: values.is_active,
		store_ids: values.store_ids,
		eligible_service_ids: values.eligible_service_ids,
	};

	if (values.discount_type === "buy_n_get_m_free") {
		return {
			...base,
			discount_type: "buy_n_get_m_free",
			buy_quantity: values.buy_quantity ?? 1,
			free_quantity: values.free_quantity ?? 1,
		};
	}

	return {
		...base,
		discount_type: values.discount_type,
		discount_value: values.discount_value,
		max_discount: values.max_discount?.trim() ? values.max_discount : null,
	};
}

const DISCOUNT_TYPE_OPTIONS: { value: CampaignDiscountType; label: string }[] =
	[
		{ value: "fixed", label: "Fixed" },
		{ value: "percentage", label: "Percentage" },
		{ value: "buy_n_get_m_free", label: "Buy N Get M Free" },
	];

const FixedDiscountFields = () => {
	const { control } = useFormContext<CampaignFormState>();

	return (
		<>
			<Controller
				name="discount_value"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="campaign-discount-value" asterisk>
							Discount Value
						</FieldLabel>
						<CurrencyInput
							id="campaign-discount-value"
							placeholder="Rp0"
							value={field.value}
							onValueChange={field.onChange}
							required
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Controller
				name="max_discount"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="campaign-max-discount">
							Max Discount
						</FieldLabel>
						<CurrencyInput
							id="campaign-max-discount"
							placeholder="optional"
							value={field.value ?? ""}
							onValueChange={field.onChange}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
		</>
	);
};

const PercentageDiscountFields = () => {
	const { control } = useFormContext<CampaignFormState>();

	return (
		<>
			<Controller
				name="discount_value"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="campaign-discount-value" asterisk>
							Discount Value
						</FieldLabel>
						<Input
							{...field}
							id="campaign-discount-value"
							type="number"
							placeholder="e.g. 10"
							min={1}
							max={100}
							aria-invalid={fieldState.invalid}
							className="h-10"
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Controller
				name="max_discount"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="campaign-max-discount">
							Max Discount
						</FieldLabel>
						<CurrencyInput
							id="campaign-max-discount"
							placeholder="optional"
							value={field.value ?? ""}
							onValueChange={field.onChange}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
		</>
	);
};

const BogoDiscountFields = () => {
	const { control } = useFormContext<CampaignFormState>();

	return (
		<>
			<Controller
				name="buy_quantity"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="campaign-buy-quantity" asterisk>
							Buy Quantity
						</FieldLabel>
						<Input
							id="campaign-buy-quantity"
							type="number"
							min={1}
							placeholder="e.g. 4"
							value={field.value ?? ""}
							onChange={(event) =>
								field.onChange(
									event.target.value ? Number(event.target.value) : undefined,
								)
							}
							aria-invalid={fieldState.invalid}
							className="h-10"
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Controller
				name="free_quantity"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="campaign-free-quantity" asterisk>
							Free Quantity
						</FieldLabel>
						<Input
							id="campaign-free-quantity"
							type="number"
							min={1}
							placeholder="e.g. 1"
							value={field.value ?? ""}
							onChange={(event) =>
								field.onChange(
									event.target.value ? Number(event.target.value) : undefined,
								)
							}
							aria-invalid={fieldState.invalid}
							className="h-10"
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Controller
				name="eligible_service_ids"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid} className="md:col-span-2">
						<FieldLabel htmlFor="campaign-eligible-services" asterisk>
							Eligible Services
						</FieldLabel>
						<ServicesMultiAutocomplete
							id="campaign-eligible-services"
							placeholder="Select eligible services"
							values={field.value}
							onValuesChange={field.onChange}
							error={fieldState.error}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
		</>
	);
};

const discountTypeFieldsMap: Record<
	CampaignDiscountType,
	() => React.JSX.Element
> = {
	fixed: FixedDiscountFields,
	percentage: PercentageDiscountFields,
	buy_n_get_m_free: BogoDiscountFields,
};

export function CampaignForm({
	defaultValues,
	stores,
	handleOnSubmit,
	isEditing,
	onReset,
}: CampaignFormProps) {
	const form = useForm<CampaignFormState>({
		resolver: zodResolver(campaignFormSchema),
		defaultValues,
	});
	const isSubmitting = form.formState.isSubmitting;
	useSheetDirtyGuard(form.formState.isDirty);
	const discountType = useWatch({
		control: form.control,
		name: "discount_type",
	});
	const DiscountFields = discountTypeFieldsMap[discountType];

	return (
		<FormProvider {...form}>
			<form
				onSubmit={form.handleSubmit(async (values) => {
					await handleOnSubmit(toCampaignPayload(values));
				})}
			>
				<FieldGroup>
					<Controller
						name="code"
						control={form.control}
						render={({ field, fieldState }) => (
							<Field data-invalid={fieldState.invalid}>
								<FieldLabel htmlFor="campaign-code" asterisk>
									Code
								</FieldLabel>
								<Input
									{...field}
									id="campaign-code"
									placeholder="e.g. MARCH10"
									aria-invalid={fieldState.invalid}
									disabled={isSubmitting}
									className="h-10"
								/>
								<FieldError errors={[fieldState.error]} />
							</Field>
						)}
					/>

					<Controller
						name="name"
						control={form.control}
						render={({ field, fieldState }) => (
							<Field data-invalid={fieldState.invalid}>
								<FieldLabel htmlFor="campaign-name" asterisk>
									Name
								</FieldLabel>
								<Input
									{...field}
									id="campaign-name"
									placeholder="e.g. March Promo"
									aria-invalid={fieldState.invalid}
									disabled={isSubmitting}
									className="h-10"
								/>
								<FieldError errors={[fieldState.error]} />
							</Field>
						)}
					/>

					<Controller
						name="discount_type"
						control={form.control}
						render={({ field, fieldState }) => (
							<Field data-invalid={fieldState.invalid}>
								<FieldLabel htmlFor="campaign-discount-type" asterisk>
									Discount Type
								</FieldLabel>
								<Select
									value={field.value}
									onValueChange={(value) =>
										field.onChange((value ?? "fixed") as CampaignDiscountType)
									}
									disabled={isSubmitting}
								>
									<SelectTrigger id="campaign-discount-type" size="md">
										<SelectValue placeholder="Select discount type" />
									</SelectTrigger>
									<SelectContent>
										{DISCOUNT_TYPE_OPTIONS.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FieldError errors={[fieldState.error]} />
							</Field>
						)}
					/>

					<DiscountFields />

					<Controller
						name="min_order_total"
						control={form.control}
						render={({ field, fieldState }) => (
							<Field data-invalid={fieldState.invalid}>
								<FieldLabel htmlFor="campaign-min-order" asterisk>
									Min Order Total
								</FieldLabel>
								<CurrencyInput
									id="campaign-min-order"
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
						name="starts_at"
						control={form.control}
						render={({ field, fieldState }) => (
							<Field data-invalid={fieldState.invalid}>
								<FieldLabel htmlFor="campaign-starts-at">Starts At</FieldLabel>
								<Input
									{...field}
									id="campaign-starts-at"
									type="datetime-local"
									aria-invalid={fieldState.invalid}
									disabled={isSubmitting}
									className="h-10"
								/>
								<FieldError errors={[fieldState.error]} />
							</Field>
						)}
					/>

					<Controller
						name="ends_at"
						control={form.control}
						render={({ field, fieldState }) => (
							<Field data-invalid={fieldState.invalid}>
								<FieldLabel htmlFor="campaign-ends-at">Ends At</FieldLabel>
								<Input
									{...field}
									id="campaign-ends-at"
									type="datetime-local"
									aria-invalid={fieldState.invalid}
									disabled={isSubmitting}
									className="h-10"
								/>
								<FieldError errors={[fieldState.error]} />
							</Field>
						)}
					/>

					<Controller
						name="store_ids"
						control={form.control}
						render={({ field }) => (
							<FieldSet className="border p-2">
								<FieldLegend variant="label">
									Stores (empty = all stores)
								</FieldLegend>
								<FieldGroup>
									{stores.map((store) => {
										const checked = field.value.includes(store.id);
										return (
											<Field
												orientation="horizontal"
												key={store.id}
												className="flex items-center gap-2 text-sm"
											>
												<Checkbox
													id={`campaign-store-${store.id}`}
													checked={checked}
													onCheckedChange={(value) => {
														if (value) {
															field.onChange([...field.value, store.id]);
															return;
														}

														field.onChange(
															field.value.filter(
																(id: number) => id !== store.id,
															),
														);
													}}
													disabled={isSubmitting}
												/>
												<FieldLabel htmlFor={`campaign-store-${store.id}`}>
													{store.name}
												</FieldLabel>
											</Field>
										);
									})}
								</FieldGroup>
							</FieldSet>
						)}
					/>

					<Controller
						name="is_active"
						control={form.control}
						render={({ field }) => (
							<FieldLabel htmlFor="campaign-active" className="md:col-span-2">
								<Field orientation="horizontal">
									<FieldContent>
										<FieldTitle>Active</FieldTitle>
										<FieldDescription>
											Active campaigns can be applied during checkout.
										</FieldDescription>
									</FieldContent>
									<Switch
										id="campaign-active"
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
							{isEditing ? "Update Campaign" : "Create Campaign"}
						</Button>
					</div>
				</FieldGroup>
			</form>
		</FormProvider>
	);
}
