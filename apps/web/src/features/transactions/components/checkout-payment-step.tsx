import { campaignIneligibilityReason } from "@fresclean/api/schema";
import { CheckIcon, ReceiptIcon, StorefrontIcon } from "@phosphor-icons/react";
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
import {
	campaignsQueryOptions,
	paymentMethodsQueryOptions,
} from "@/lib/query-options";
import { cn } from "@/lib/utils";
import { formatIDRCurrency } from "@/shared/utils";

// Step ③ — money. Tender first, because it decides the rest: discounts
// resolve at payment (ADR-0018), so campaigns/voucher/manual discount are
// offered only when the order is being paid at drop-off. Pay later defers
// them to the collect-payment form on the order page.
export const CheckoutPaymentStep = () => {
	const { visibleStores } = useTransactionsPageContext();
	const { subtotal, pricing } = useCheckoutPricing();
	const { serviceRows } = useCart();
	const form = useFormContext<TransactionDraftValues>();
	const appliedVouchers =
		useWatch({ control: form.control, name: "appliedVouchers" }) ?? [];
	const selectedStoreId =
		useWatch({ control: form.control, name: "selectedStoreId" }) ?? "";
	const paymentMethodsQuery = useQuery(paymentMethodsQueryOptions());

	const paymentMethodOptions = useMemo<ComboboxOption[]>(
		() =>
			(paymentMethodsQuery.data ?? []).map((paymentMethod) => ({
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
		...campaignsQueryOptions({
			store_id: selectedStoreNumber,
			is_active: true,
		}),
		enabled: selectedStoreNumber !== undefined,
	});

	// ADR-0018: no price, no payment. A blank repair line makes the Order
	// unpayable at drop-off, so every tender except "Pay later" locks instead
	// of bouncing at submit. The same blank line is what defers the promo
	// (ADR-0018 amended): once every line is priced the discount may settle
	// here, whether the customer pays now or sends a driver and pays at pickup.
	const unpricedCount = countUnpricedServiceLines(serviceRows);
	const isFullyPriced = unpricedCount === 0;
	const paymentBlocked = !isFullyPriced;

	// Only campaigns whose rules pass for the current store + the cart total —
	// at drop-off payment every line is priced (blank lines lock the tender),
	// so the total is the campaign base (ADR-0018).
	const eligibleCampaigns = useMemo(
		() =>
			filterEligibleCampaigns(campaignsQuery.data, {
				grossTotal: subtotal,
				storeId: selectedStoreNumber,
			}),
		[campaignsQuery.data, selectedStoreNumber, subtotal],
	);

	// Drop any selected campaign that stopped being eligible (e.g. the cart total
	// fell below its minimum) so a stale id can't ride along to submit.
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

	// Drop any applied voucher that stopped being eligible (e.g. the cart total
	// fell below its minimum). Mirrors the listed-campaign prune above: a
	// silently zeroed code would otherwise ride to submit and hard-fail the
	// whole order.
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

	// A blank line added after a tender was picked must clear it — the draft
	// would otherwise submit as paid and hard-fail at the server gate.
	useEffect(() => {
		if (!paymentBlocked) {
			return;
		}
		if (form.getValues("selectedPaymentMethodId") !== "") {
			form.setValue("selectedPaymentMethodId", "", { shouldValidate: true });
		}
	}, [paymentBlocked, form]);

	// A blank line carries no discount (ADR-0018 amended): adding an unpriced
	// repair to a cart that already has promos on it clears them the moment the
	// line lands — visibly, with the deferral sentence in the section's place,
	// never silently at submit time. Switching to "Pay later" no longer clears
	// anything: a promo on a fully priced Order survives to the Receipt.
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
						{/* Method = "how the money arrived". Picking one marks the order
						    paid; "Pay later" (empty) leaves it unpaid. No separate
						    paid/unpaid toggle — the selection carries both. A native
						    fieldset/legend names the group for SR users. */}
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
							<PaymentMethodTile
								hint="Unpaid"
								isSelected={field.value === ""}
								label="Pay later"
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
							<p className="text-muted-foreground text-xs">
								A line has no price yet — the order goes out unpaid and is
								collected once every line is priced.
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
									Manual Discount
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
				<p className="text-muted-foreground text-sm">
					A line has no price yet — campaigns, voucher codes and manual discount
					are entered once every item is priced.
				</p>
			)}

			<div className="grid gap-3 border border-border/70 p-4">
				<div className="flex items-center justify-between gap-3 text-sm">
					<div className="flex items-center gap-2">
						<StorefrontIcon className="size-4 text-muted-foreground" />
						<span className="text-muted-foreground">Store</span>
					</div>
					<span className="font-medium">{selectedStore?.name ?? "-"}</span>
				</div>
				<div className="flex items-center justify-between gap-3 text-sm">
					<div className="flex items-center gap-2">
						<ReceiptIcon className="size-4 text-muted-foreground" />
						<span className="text-muted-foreground">Subtotal</span>
					</div>
					<span className="font-medium">
						{formatIDRCurrency(String(subtotal))}
					</span>
				</div>
				{pricing.campaignBreakdown.map(({ campaign, amount }) => (
					<div
						className="flex items-center justify-between gap-3 text-sm"
						key={campaign.id}
					>
						<span className="text-muted-foreground">
							{campaign.code} ({campaign.name})
						</span>
						<span className="font-medium text-destructive">
							-{formatIDRCurrency(String(amount))}
						</span>
					</div>
				))}
				<div className="flex items-center justify-between gap-3 text-sm">
					<span className="text-muted-foreground">Manual Discount</span>
					<span
						className={cn(
							"font-medium",
							pricing.manualDiscount > 0 && "text-destructive",
						)}
					>
						-{formatIDRCurrency(String(pricing.manualDiscount))}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-base font-semibold">
					<span>Total Payment</span>
					<span>{formatIDRCurrency(String(Math.round(pricing.total)))}</span>
				</div>
			</div>
		</div>
	);
};

// Shared radio group name so the tiles are mutually exclusive at the DOM level
// and get native arrow-key navigation.
const PAYMENT_METHOD_RADIO_NAME = "checkout-payment-method";

interface PaymentMethodTileProps {
	label: string;
	hint?: string;
	value: string;
	isSelected: boolean;
	disabled?: boolean;
	onSelect: () => void;
}

// A real (visually hidden) radio input wrapped by the styled tile label: native
// radiogroup semantics and keyboard behavior, with the full tile as the touch
// target. Selection styling is driven by isSelected; focus ring shows via the
// label's :has(:focus-visible).
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
			"flex min-h-12 cursor-pointer items-center justify-between gap-2 border px-3 py-2 text-left transition active:scale-[0.97] has-[:focus-visible]:border-ring has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring/50",
			isSelected
				? "border-foreground bg-foreground text-background"
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
			<span className="text-sm font-medium">{label}</span>
			{hint ? (
				<span
					className={cn(
						"text-[11px]",
						isSelected ? "text-background/70" : "text-muted-foreground",
					)}
				>
					{hint}
				</span>
			) : null}
		</span>
		{isSelected ? (
			<CheckIcon className="size-4 shrink-0" weight="bold" />
		) : null}
	</label>
);
