import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import {
	Controller,
	FormProvider,
	useForm,
	useFormContext,
	useWatch,
} from "react-hook-form";
import { z } from "zod";
import { CurrencyInput } from "@/components/form/currency-input";
import { SelectField } from "@/components/form/select-field";
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
import { Switch } from "@/components/ui/switch";
import { ServicesMultiAutocomplete } from "@/features/orders/components/services-multi-autocomplete";
import { useSheetDirtyGuard } from "@/hooks/useSheetDirtyGuard";
import type { CampaignPayload } from "@/lib/api";

const campaignFormBaseSchema = z.object({
	code: z.string().trim().min(1, "Code is required"),
	name: z.string().trim().min(1, "Name is required"),
	redemption_mode: z.enum(["listed", "code"]),
	discount_type: z.enum(["fixed", "percentage", "buy_n_get_m_free"]),
	discount_value: z.string(),
	min_order_total: z.string().min(1, "Min order total is required"),
	max_discount: z.string().optional(),
	usage_limit: z.number().int().min(1).optional(),
	code_count: z.number().int().min(1).optional(),
	starts_at: z.string().optional(),
	ends_at: z.string().optional(),
	is_active: z.boolean(),
	store_ids: z.array(z.number().int().positive()),
	eligible_service_ids: z.array(z.number().int().positive()),
	buy_quantity: z.number().int().min(1).optional(),
	free_quantity: z.number().int().min(1).optional(),
});

const makeCampaignFormSchema = (isEditing: boolean) =>
	campaignFormBaseSchema.superRefine((value, ctx) => {
		if (value.redemption_mode === "code") {
			// code_count is fixed at creation (immutable): its field is disabled and
			// stripped from the update payload when editing, so require it only on
			// create — otherwise a voucher edit could never satisfy the form.
			if (!isEditing && (!value.code_count || value.code_count < 1)) {
				ctx.addIssue({
					code: "custom",
					path: ["code_count"],
					message: "Code count is required for vouchers",
				});
			}
			if (value.usage_limit != null) {
				ctx.addIssue({
					code: "custom",
					path: ["usage_limit"],
					message: "Vouchers cannot set a usage limit",
				});
			}
		} else if (value.code_count != null) {
			ctx.addIssue({
				code: "custom",
				path: ["code_count"],
				message: "Only vouchers can set a code count",
			});
		}

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

export type CampaignFormState = z.infer<typeof campaignFormBaseSchema>;

type CampaignDiscountType = CampaignFormState["discount_type"];

type CampaignFormProps = {
	defaultValues: CampaignFormState;
	stores: Array<{ id: number; name: string; code: string }>;
	handleOnSubmit: (values: CampaignPayload) => Promise<void> | void;
	isEditing: boolean;
	onReset: () => void;
};

function toCampaignPayload(values: CampaignFormState): CampaignPayload {
	const isVoucher = values.redemption_mode === "code";
	const base = {
		code: values.code,
		name: values.name,
		min_order_total: values.min_order_total,
		starts_at: values.starts_at ? new Date(values.starts_at) : null,
		ends_at: values.ends_at ? new Date(values.ends_at) : null,
		is_active: values.is_active,
		store_ids: values.store_ids,
		eligible_service_ids: values.eligible_service_ids,
		redemption_mode: values.redemption_mode,
		usage_limit: isVoucher ? null : (values.usage_limit ?? null),
		...(isVoucher ? { code_count: values.code_count } : {}),
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

type CampaignRedemptionMode = CampaignFormState["redemption_mode"];

const REDEMPTION_MODE_OPTIONS: {
	value: CampaignRedemptionMode;
	label: string;
}[] = [
	{ value: "listed", label: "Listed" },
	{ value: "code", label: "Voucher (codes)" },
];

const UsageLimitField = () => {
	const {
		control,
		formState: { isSubmitting },
	} = useFormContext<CampaignFormState>();

	return (
		<Controller
			control={control}
			name="usage_limit"
			render={({ field, fieldState }) => (
				<Field data-invalid={fieldState.invalid}>
					<FieldLabel htmlFor="campaign-usage-limit">Usage Limit</FieldLabel>
					<Input
						aria-invalid={fieldState.invalid}
						className="h-10"
						disabled={isSubmitting}
						id="campaign-usage-limit"
						min={1}
						onChange={(event) =>
							field.onChange(
								event.target.value ? Number(event.target.value) : undefined,
							)
						}
						placeholder="Unlimited"
						type="number"
						value={field.value ?? ""}
					/>
					<FieldDescription>
						Max redemptions. Empty = unlimited.
					</FieldDescription>
					<FieldError errors={[fieldState.error]} />
				</Field>
			)}
		/>
	);
};

interface CodeCountFieldProps {
	isEditing: boolean;
}

const CodeCountField = ({ isEditing }: CodeCountFieldProps) => {
	const {
		control,
		formState: { isSubmitting },
	} = useFormContext<CampaignFormState>();

	return (
		<Controller
			control={control}
			name="code_count"
			render={({ field, fieldState }) => (
				<Field data-invalid={fieldState.invalid}>
					<FieldLabel htmlFor="campaign-code-count" asterisk={!isEditing}>
						Code Count
					</FieldLabel>
					<Input
						aria-invalid={fieldState.invalid}
						className="h-10"
						disabled={isSubmitting || isEditing}
						id="campaign-code-count"
						min={1}
						onChange={(event) =>
							field.onChange(
								event.target.value ? Number(event.target.value) : undefined,
							)
						}
						placeholder="e.g. 50"
						type="number"
						value={field.value ?? ""}
					/>
					<FieldDescription>
						{isEditing
							? "Batch size is fixed after creation."
							: "Bearer codes minted on creation."}
					</FieldDescription>
					<FieldError errors={[fieldState.error]} />
				</Field>
			)}
		/>
	);
};

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
	const schema = useMemo(() => makeCampaignFormSchema(isEditing), [isEditing]);
	const form = useForm<CampaignFormState>({
		resolver: zodResolver(schema),
		defaultValues,
	});
	const isSubmitting = form.formState.isSubmitting;
	useSheetDirtyGuard(form.formState.isDirty);
	const discountType = useWatch({
		control: form.control,
		name: "discount_type",
	});
	const redemptionMode = useWatch({
		control: form.control,
		name: "redemption_mode",
	});
	const isVoucher = redemptionMode === "code";
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
						name="redemption_mode"
						control={form.control}
						render={({ field, fieldState }) => (
							<Field data-invalid={fieldState.invalid}>
								<FieldLabel htmlFor="campaign-redemption-mode" asterisk>
									Redemption Mode
								</FieldLabel>
								<SelectField
									disabled={isSubmitting || isEditing}
									id="campaign-redemption-mode"
									items={REDEMPTION_MODE_OPTIONS}
									onValueChange={(value) =>
										field.onChange(value as CampaignRedemptionMode)
									}
									placeholder="Select redemption mode"
									value={field.value}
								/>
								{isEditing ? (
									<FieldDescription>
										Redemption mode is fixed after creation.
									</FieldDescription>
								) : (
									<FieldDescription>
										Listed campaigns are picked at checkout. Vouchers are
										redeemed by code.
									</FieldDescription>
								)}
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
								<SelectField
									id="campaign-discount-type"
									items={DISCOUNT_TYPE_OPTIONS}
									value={field.value}
									onValueChange={(value) =>
										field.onChange(value as CampaignDiscountType)
									}
									disabled={isSubmitting}
									placeholder="Select discount type"
								/>
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

					{isVoucher ? (
						<CodeCountField isEditing={isEditing} />
					) : (
						<UsageLimitField />
					)}

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
