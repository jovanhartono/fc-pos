import { campaignIneligibilityReason } from "@fresclean/api/schema";
import {
	Invoice01Icon,
	Store01Icon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { CurrencyInput } from "@/components/form/currency-input";
import type { ComboboxOption } from "@/components/ui/combobox";
import {
	Field,
	FieldError,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { campaignsQueries } from "@/features/campaigns/api";
import { paymentMethodsQueries } from "@/features/payment-methods/api";
import {
	countUnpricedServiceLines,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { CampaignTileGroup } from "@/features/transactions/components/campaign-tile-group";
import { VoucherCodeEntry } from "@/features/transactions/components/voucher-code-entry";
import { useCheckoutPricing } from "@/features/transactions/hooks/useCheckoutPricing";
import { filterEligibleCampaigns } from "@/features/transactions/lib/campaign-eligibility";
import { useTransactionsPageContext } from "@/features/transactions/lib/transactions-context";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

// A discount settles once every line is priced, not once money arrives
// (ADR-0018), so a Customer paying at pickup still gets it on the Receipt.
export const CheckoutPaymentStep = () => {
	const { visibleStores } = useTransactionsPageContext();
	const { subtotal, pricing } = useCheckoutPricing();
	const { serviceRows } = useCart();
	const form = useFormContext<TransactionDraftValues>();
	const appliedVouchers =
		useWatch({ control: form.control, name: "appliedVouchers" }) ?? [];
	const selectedStoreId =
		useWatch({ control: form.control, name: "selectedStoreId" }) ?? "";
	const paymentMethodsQuery = useQuery(paymentMethodsQueries.list());

	const paymentMethodOptions = useMemo<ComboboxOption[]>(
		() =>
			// Gateway money arrives through a QRIS on the Order, never a tap here.
			(paymentMethodsQuery.data ?? [])
				.filter((paymentMethod) => !paymentMethod.gateway)
				.map((paymentMethod) => ({
					value: String(paymentMethod.id),
					label: paymentMethod.name,
				})),
		[paymentMethodsQuery.data],
	);

	const selectedStoreNumber =
		selectedStoreId && Number.isFinite(Number(selectedStoreId))
			? Number(selectedStoreId)
			: undefined;
	const selectedStore = selectedStoreNumber
		? visibleStores.find((store) => store.id === selectedStoreNumber)
		: undefined;

	const campaignsQuery = useQuery({
		...campaignsQueries.list({
			store_id: selectedStoreNumber,
			is_active: true,
		}),
		enabled: selectedStoreNumber !== undefined,
	});

	// ADR-0018: no price, no payment. A blank Repair locks every method except
	// "Pay Later", and moves discounts to the Order page.
	const unpricedCount = countUnpricedServiceLines(serviceRows);
	const isFullyPriced = unpricedCount === 0;
	const paymentBlocked = !isFullyPriced;

	const eligibleCampaigns = useMemo(
		() =>
			filterEligibleCampaigns(campaignsQuery.data, {
				grossTotal: subtotal,
				storeId: selectedStoreNumber,
			}),
		[campaignsQuery.data, selectedStoreNumber, subtotal],
	);

	// A cashier who removes a line can drop the total below a picked Campaign's
	// minimum; it is unpicked rather than sent.
	useEffect(() => {
		if (selectedStoreNumber === undefined || campaignsQuery.isPending) {
			return;
		}
		const eligibleIds = new Set(
			eligibleCampaigns.map((campaign) => String(campaign.id)),
		);
		const current = form.getValues("selectedCampaignIds");
		const pruned = current.filter((id) => eligibleIds.has(id));
		if (pruned.length !== current.length) {
			form.setValue("selectedCampaignIds", pruned, { shouldValidate: true });
		}
	}, [eligibleCampaigns, selectedStoreNumber, campaignsQuery.isPending, form]);

	// Same for a Voucher code, or it would fail the whole Order at checkout.
	useEffect(() => {
		if (selectedStoreNumber === undefined) {
			return;
		}
		const now = new Date();
		const eligible = appliedVouchers.filter(
			(entry) =>
				campaignIneligibilityReason(entry.campaign, {
					now,
					grossTotal: subtotal,
					storeId: selectedStoreNumber,
				}) === null,
		);
		if (eligible.length !== appliedVouchers.length) {
			form.setValue("appliedVouchers", eligible, { shouldValidate: true });
		}
	}, [appliedVouchers, subtotal, selectedStoreNumber, form]);

	// A blank line added after a method was picked clears it, or the Order
	// would go in as paid and fail at the server.
	useEffect(() => {
		if (!paymentBlocked) {
			return;
		}
		if (form.getValues("selectedPaymentMethodId") !== "") {
			form.setValue("selectedPaymentMethodId", "", { shouldValidate: true });
		}
	}, [paymentBlocked, form]);

	// ADR-0018 amended: adding a blank Repair clears discounts on screen at
	// once, never silently at checkout. "Pay Later" alone clears nothing.
	useEffect(() => {
		if (isFullyPriced) {
			return;
		}
		if (form.getValues("selectedCampaignIds").length > 0) {
			form.setValue("selectedCampaignIds", [], { shouldValidate: true });
		}
		if (form.getValues("appliedVouchers").length > 0) {
			form.setValue("appliedVouchers", [], { shouldValidate: true });
		}
		if (form.getValues("manualDiscount") !== "") {
			form.setValue("manualDiscount", "", { shouldValidate: true });
		}
	}, [isFullyPriced, form]);

	return (
		<div className="grid gap-5">
			<Controller
				control={form.control}
				name="selectedPaymentMethodId"
				render={({ field, fieldState }) => (
					<FieldSet className="gap-2" data-invalid={fieldState.invalid}>
						<FieldLegend variant="label">Payment</FieldLegend>
						{/* No paid/unpaid toggle: picking a method marks the Order paid,
						    "Pay Later" leaves it unpaid. */}
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
							<PaymentMethodTile
								hint="Unpaid"
								isSelected={field.value === ""}
								label="Pay Later"
								onSelect={() => field.onChange("")}
								value=""
							/>
							{paymentMethodOptions.map((option) => (
								<PaymentMethodTile
									disabled={paymentBlocked}
									isSelected={field.value === option.value}
									key={option.value}
									label={option.label}
									onSelect={() => field.onChange(option.value)}
									value={option.value}
								/>
							))}
						</div>
						{paymentBlocked ? (
							<p className="text-muted-foreground text-footnote">
								A line has no price yet. The Order saves unpaid; collect payment
								once every line is priced.
							</p>
						) : null}
						<FieldError errors={[fieldState.error]} />
					</FieldSet>
				)}
			/>

			{isFullyPriced ? (
				<>
					<Controller
						control={form.control}
						name="selectedCampaignIds"
						render={({ field, fieldState }) => (
							<FieldSet className="gap-2" data-invalid={fieldState.invalid}>
								<FieldLegend variant="label">Campaigns</FieldLegend>
								<CampaignTileGroup
									eligibleCampaigns={eligibleCampaigns}
									hasStore={selectedStoreNumber !== undefined}
									isLoading={campaignsQuery.isLoading}
									onToggle={(campaignId) =>
										field.onChange(
											field.value.includes(campaignId)
												? field.value.filter((value) => value !== campaignId)
												: [...field.value, campaignId],
										)
									}
									selectedIds={field.value}
								/>
								<VoucherCodeEntry
									appliedVouchers={appliedVouchers}
									onChange={(next) =>
										form.setValue("appliedVouchers", next, {
											shouldDirty: true,
											shouldValidate: true,
										})
									}
									storeId={selectedStoreNumber}
									subtotal={subtotal}
								/>
								<FieldError errors={[fieldState.error]} />
							</FieldSet>
						)}
					/>

					<Controller
						control={form.control}
						name="manualDiscount"
						render={({ field, fieldState }) => (
							<Field data-invalid={fieldState.invalid}>
								<FieldLabel htmlFor="transaction-discount">
									Manual discount
								</FieldLabel>
								<CurrencyInput
									id="transaction-discount"
									onValueChange={field.onChange}
									value={field.value}
								/>
								<FieldError errors={[fieldState.error]} />
							</Field>
						)}
					/>
				</>
			) : (
				<p className="text-muted-foreground text-body">
					A line has no price yet. Add Campaigns, Voucher codes and manual
					discount once every line is priced.
				</p>
			)}

			<div className="grid gap-3 rounded-md border border-border/70 p-4">
				<div className="flex items-center justify-between gap-3 text-body">
					<div className="flex items-center gap-2">
						<HugeiconsIcon
							icon={Store01Icon}
							className="size-4 text-muted-foreground"
						/>
						<span className="text-muted-foreground">Store</span>
					</div>
					<span className="font-medium">{selectedStore?.name ?? "-"}</span>
				</div>
				<div className="flex items-center justify-between gap-3 text-body">
					<div className="flex items-center gap-2">
						<HugeiconsIcon
							icon={Invoice01Icon}
							className="size-4 text-muted-foreground"
						/>
						<span className="text-muted-foreground">Subtotal</span>
					</div>
					<span className="font-medium">{formatMoney(String(subtotal))}</span>
				</div>
				{pricing.campaignBreakdown.map(({ campaign, amount }) => (
					<div
						className="flex items-center justify-between gap-3 text-body"
						key={campaign.id}
					>
						<span className="text-muted-foreground">
							{campaign.code} ({campaign.name})
						</span>
						<span className="font-medium text-destructive">
							-{formatMoney(String(amount))}
						</span>
					</div>
				))}
				<div className="flex items-center justify-between gap-3 text-body">
					<span className="text-muted-foreground">Manual discount</span>
					<span
						className={cn(
							"font-medium",
							pricing.manualDiscount > 0 && "text-destructive",
						)}
					>
						-{formatMoney(String(pricing.manualDiscount))}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-headline font-semibold">
					<span>Total Payment</span>
					<span>{formatMoney(String(Math.round(pricing.total)))}</span>
				</div>
			</div>
		</div>
	);
};

const PAYMENT_METHOD_RADIO_NAME = "checkout-payment-method";

interface PaymentMethodTileProps {
	label: string;
	hint?: string;
	value: string;
	isSelected: boolean;
	disabled?: boolean;
	onSelect: () => void;
}

const PaymentMethodTile = ({
	label,
	hint,
	value,
	isSelected,
	disabled,
	onSelect,
}: PaymentMethodTileProps) => (
	<label
		className={cn(
			"flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-sm border px-3 py-2 text-left transition active:scale-[0.97] has-[:focus-visible]:border-ring has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring/50",
			isSelected
				? "border-primary bg-primary text-primary-foreground"
				: "border-border/70 text-foreground/80 hover:border-border hover:bg-muted/40",
			disabled &&
				"cursor-not-allowed opacity-50 hover:border-border/70 hover:bg-transparent active:scale-100",
		)}
	>
		<input
			checked={isSelected}
			className="sr-only"
			disabled={disabled}
			name={PAYMENT_METHOD_RADIO_NAME}
			onChange={onSelect}
			type="radio"
			value={value}
		/>
		<span className="flex flex-col">
			<span className="text-body font-medium">{label}</span>
			{hint ? (
				<span
					className={cn(
						"text-caption",
						isSelected ? "text-primary-foreground/70" : "text-muted-foreground",
					)}
				>
					{hint}
				</span>
			) : null}
		</span>
		{isSelected ? (
			<HugeiconsIcon
				icon={Tick02Icon}
				className="size-4 shrink-0"
				strokeWidth={2}
			/>
		) : null}
	</label>
);
