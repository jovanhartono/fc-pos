import {
	CampaignPayloadSchema,
	type CampaignRedemptionMode,
} from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Controller,
	FormProvider,
	type Resolver,
	useForm,
	useFormContext,
	useWatch,
} from "react-hook-form";
import type { z } from "zod";
import { CurrencyInput } from "@/components/form/currency-input";
import { SelectField } from "@/components/form/select-field";
import {
	SHEET_FORM_GRID,
	SheetFormActions,
} from "@/components/form/sheet-form-actions";
import { SwitchList, SwitchRow } from "@/components/form/switch-list";
import { DatePicker } from "@/components/ui/date-picker";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { CampaignPayload } from "@/features/campaigns/api";
import { ServicesMultiAutocomplete } from "@/features/orders/components/services-multi-autocomplete";
import { StoreChecklist } from "@/features/stores/components/store-checklist";
import { useSheetDirtyGuard } from "@/hooks/useSheetDirtyGuard";
import { cn } from "@/lib/utils";

type CampaignDiscountType = CampaignPayload["discount_type"];

// What the sheet holds while a Campaign is being filled in. Shape only — every
// rule about it lives in the server's CampaignPayloadSchema.
export interface CampaignFormInput {
	code: string;
	name: string;
	redemption_mode: CampaignRedemptionMode;
	discount_type: CampaignDiscountType;
	discount_value: string;
	min_order_total: string;
	max_discount: string | null;
	usage_limit: number | null;
	code_count: number | null;
	buy_quantity: number | null;
	free_quantity: number | null;
	starts_at: string | null;
	ends_at: string | null;
	is_active: boolean;
	store_ids: number[];
	eligible_service_ids: number[];
}

interface CampaignFormProps {
	defaultValues: CampaignFormInput;
	stores: Array<{ id: number; name: string; code: string }>;
	handleOnSubmit: (values: CampaignPayload) => Promise<void> | void;
	isEditing: boolean;
	onReset: () => void;
}

const REQUIRED_FIELD_LABELS: Partial<Record<keyof CampaignFormInput, string>> =
	{
		buy_quantity: "Buy quantity",
		code: "Code",
		discount_value: "Discount value",
		eligible_service_ids: "At least one eligible service",
		free_quantity: "Free quantity",
		min_order_total: "Min Order total",
		name: "Name",
	};

const MAX_LENGTH_MESSAGES: Partial<Record<keyof CampaignFormInput, string>> = {
	code: "Code must be 32 characters or fewer",
	name: "Name must be 255 characters or fewer",
};

// The API wording for a box left blank or overfilled reads like a stack trace;
// the admin setting up a Campaign gets a plain sentence instead.
const campaignFieldMessages: z.core.$ZodErrorMap = (issue) => {
	const field = String(issue.path?.[0]) as keyof CampaignFormInput;

	if (issue.code === "too_big") {
		return MAX_LENGTH_MESSAGES[field];
	}

	if (issue.code === "too_small" || issue.code === "invalid_type") {
		const label = REQUIRED_FIELD_LABELS[field];
		return label ? `${label} is required` : undefined;
	}

	return undefined;
};

const DISCOUNT_TYPE_OPTIONS: { value: CampaignDiscountType; label: string }[] =
	[
		{ value: "fixed", label: "Fixed" },
		{ value: "percentage", label: "Percentage" },
		{ value: "buy_n_get_m_free", label: "Buy N get M free" },
	];

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
	} = useFormContext<CampaignFormInput>();

	return (
		<Controller
			control={control}
			name="usage_limit"
			render={({ field, fieldState }) => (
				<Field className="col-span-full" data-invalid={fieldState.invalid}>
					<FieldLabel htmlFor="campaign-usage-limit">Usage limit</FieldLabel>
					<Input
						aria-invalid={fieldState.invalid}
						disabled={isSubmitting}
						id="campaign-usage-limit"
						min={1}
						onChange={(event) =>
							field.onChange(
								event.target.value ? Number(event.target.value) : null,
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

const CodeCountField = () => {
	const {
		control,
		formState: { isSubmitting },
	} = useFormContext<CampaignFormInput>();

	return (
		<Controller
			control={control}
			name="code_count"
			render={({ field, fieldState }) => (
				<Field className="col-span-full" data-invalid={fieldState.invalid}>
					<FieldLabel htmlFor="campaign-code-count" asterisk>
						Code count
					</FieldLabel>
					<Input
						aria-invalid={fieldState.invalid}
						disabled={isSubmitting}
						id="campaign-code-count"
						min={1}
						onChange={(event) =>
							field.onChange(
								event.target.value ? Number(event.target.value) : null,
							)
						}
						placeholder="e.g. 50"
						type="number"
						value={field.value ?? ""}
					/>
					<FieldDescription>Bearer codes minted on creation.</FieldDescription>
					<FieldError errors={[fieldState.error]} />
				</Field>
			)}
		/>
	);
};

interface CampaignDateFieldProps {
	name: "starts_at" | "ends_at";
	label: string;
}

// A Campaign runs whole days, so "Ends 31 Oct" still gives the discount to a
// Customer paying that evening.
const DAY_TIME = { starts_at: "00:00", ends_at: "23:59" } as const;

const CampaignDateField = ({ name, label }: CampaignDateFieldProps) => {
	const {
		control,
		formState: { isSubmitting },
	} = useFormContext<CampaignFormInput>();
	const startsAt = useWatch({ control, name: "starts_at" });
	const id = `campaign-${name.replace("_", "-")}`;

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field data-invalid={fieldState.invalid}>
					<FieldLabel htmlFor={id}>{label}</FieldLabel>
					<div className="relative">
						<DatePicker
							className={cn("w-full justify-between", field.value && "pr-9")}
							disabled={isSubmitting}
							iconLocation="right"
							id={id}
							min={name === "ends_at" ? startsAt?.slice(0, 10) : undefined}
							onChange={(date) =>
								field.onChange(date ? `${date}T${DAY_TIME[name]}` : null)
							}
							placeholder="Not set"
							value={field.value?.slice(0, 10)}
						/>
						{field.value ? (
							<button
								aria-label={`Clear ${label}`}
								className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
								disabled={isSubmitting}
								onClick={() => field.onChange(null)}
								type="button"
							>
								<HugeiconsIcon icon={Cancel01Icon} className="size-4" />
							</button>
						) : null}
					</div>
					<FieldError errors={[fieldState.error]} />
				</Field>
			)}
		/>
	);
};

const FixedDiscountFields = () => {
	const { control } = useFormContext<CampaignFormInput>();

	return (
		<>
			<Controller
				name="discount_value"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="campaign-discount-value" asterisk>
							Discount value
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
							Max discount
						</FieldLabel>
						<CurrencyInput
							id="campaign-max-discount"
							placeholder="Optional"
							value={field.value ?? ""}
							onValueChange={(value) => field.onChange(value || null)}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
		</>
	);
};

const PercentageDiscountFields = () => {
	const { control } = useFormContext<CampaignFormInput>();

	return (
		<>
			<Controller
				name="discount_value"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="campaign-discount-value" asterisk>
							Discount value
						</FieldLabel>
						<Input
							{...field}
							id="campaign-discount-value"
							type="number"
							placeholder="e.g. 10"
							min={1}
							max={100}
							aria-invalid={fieldState.invalid}
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
							Max discount
						</FieldLabel>
						<CurrencyInput
							id="campaign-max-discount"
							placeholder="Optional"
							value={field.value ?? ""}
							onValueChange={(value) => field.onChange(value || null)}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
		</>
	);
};

const BogoDiscountFields = () => {
	const { control } = useFormContext<CampaignFormInput>();

	return (
		<>
			<Controller
				name="buy_quantity"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="campaign-buy-quantity" asterisk>
							Buy quantity
						</FieldLabel>
						<Input
							id="campaign-buy-quantity"
							type="number"
							min={1}
							placeholder="e.g. 4"
							value={field.value ?? ""}
							onChange={(event) =>
								field.onChange(
									event.target.value ? Number(event.target.value) : null,
								)
							}
							aria-invalid={fieldState.invalid}
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
							Free quantity
						</FieldLabel>
						<Input
							id="campaign-free-quantity"
							type="number"
							min={1}
							placeholder="e.g. 1"
							value={field.value ?? ""}
							onChange={(event) =>
								field.onChange(
									event.target.value ? Number(event.target.value) : null,
								)
							}
							aria-invalid={fieldState.invalid}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Controller
				name="eligible_service_ids"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid} className="col-span-full">
						<FieldLabel htmlFor="campaign-eligible-services" asterisk>
							Eligible services
						</FieldLabel>
						<ServicesMultiAutocomplete
							id="campaign-eligible-services"
							placeholder="Select eligible services"
							values={field.value}
							onValuesChange={field.onChange}
							error={fieldState.error}
						/>
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

export const CampaignForm = ({
	defaultValues,
	stores,
	handleOnSubmit,
	isEditing,
	onReset,
}: CampaignFormProps) => {
	// A Campaign keeps the redemption mode and the batch of Voucher codes it was
	// created with, so an edit leaves both out of the form entirely.
	const { redemption_mode, code_count, ...editableDefaults } = defaultValues;
	const form = useForm<CampaignFormInput, unknown, CampaignPayload>({
		// The schema reads a payload off the wire, where dates and numbers arrive
		// as text; the sheet already holds them typed.
		resolver: zodResolver(CampaignPayloadSchema, {
			error: campaignFieldMessages,
		}) as Resolver<CampaignFormInput, unknown, CampaignPayload>,
		defaultValues: isEditing ? editableDefaults : defaultValues,
	});
	const isSubmitting = form.formState.isSubmitting;
	useSheetDirtyGuard(form.formState.isDirty);
	const discountType = useWatch({
		control: form.control,
		name: "discount_type",
	});
	const watchedRedemptionMode = useWatch({
		control: form.control,
		name: "redemption_mode",
	});
	const isVoucher =
		(isEditing ? redemption_mode : watchedRedemptionMode) === "code";
	const DiscountFields = discountTypeFieldsMap[discountType];

	return (
		<FormProvider {...form}>
			<form onSubmit={form.handleSubmit(handleOnSubmit)}>
				<FieldGroup className={SHEET_FORM_GRID}>
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
								/>
								<FieldError errors={[fieldState.error]} />
							</Field>
						)}
					/>

					{isEditing ? (
						<Field className="col-span-full">
							<FieldTitle>Redemption mode</FieldTitle>
							<p className="text-body">
								{isVoucher ? "Voucher (codes)" : "Listed"}
							</p>
							<FieldDescription>
								Redemption mode is fixed after creation.
							</FieldDescription>
						</Field>
					) : (
						<Controller
							name="redemption_mode"
							control={form.control}
							render={({ field, fieldState }) => (
								<Field
									className="col-span-full"
									data-invalid={fieldState.invalid}
								>
									<FieldLabel htmlFor="campaign-redemption-mode" asterisk>
										Redemption mode
									</FieldLabel>
									<SelectField
										disabled={isSubmitting}
										id="campaign-redemption-mode"
										items={REDEMPTION_MODE_OPTIONS}
										onValueChange={(value) =>
											field.onChange(value as CampaignRedemptionMode)
										}
										placeholder="Select redemption mode"
										value={field.value}
									/>
									<FieldDescription>
										Listed campaigns are picked at checkout. Vouchers are
										redeemed by code.
									</FieldDescription>
									<FieldError errors={[fieldState.error]} />
								</Field>
							)}
						/>
					)}

					<Controller
						name="discount_type"
						control={form.control}
						render={({ field, fieldState }) => (
							<Field
								// Buy N get M free brings two quantities of its own, so its
								// type takes the whole row and the quantities pair up below.
								className={cn(
									discountType === "buy_n_get_m_free" && "col-span-full",
								)}
								data-invalid={fieldState.invalid}
							>
								<FieldLabel htmlFor="campaign-discount-type" asterisk>
									Discount type
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
									Min Order total
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

					{isVoucher && !isEditing && <CodeCountField />}
					{!isVoucher && <UsageLimitField />}

					<CampaignDateField label="Starts" name="starts_at" />
					<CampaignDateField label="Ends" name="ends_at" />

					{/* None ticked = every store, the Campaign default. */}
					<Controller
						name="store_ids"
						control={form.control}
						render={({ field }) => (
							<StoreChecklist
								disabled={isSubmitting}
								idPrefix="campaign-store"
								onChange={field.onChange}
								stores={stores}
								value={field.value}
							/>
						)}
					/>

					<SwitchList>
						<Controller
							name="is_active"
							control={form.control}
							render={({ field }) => (
								<SwitchRow
									checked={field.value}
									description="Only Active Campaigns show in the POS."
									disabled={isSubmitting}
									id="campaign-active"
									onCheckedChange={field.onChange}
									title="Active"
								/>
							)}
						/>
					</SwitchList>

					<SheetFormActions
						addLabel="Add Campaign"
						isEditing={isEditing}
						isSubmitting={isSubmitting}
						onCancel={onReset}
					/>
				</FieldGroup>
			</form>
		</FormProvider>
	);
};
