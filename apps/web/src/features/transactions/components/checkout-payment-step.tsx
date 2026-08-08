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
	hasEstimateLine,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { VoucherCodeEntry } from "@/features/transactions/components/voucher-code-entry";
import { useCheckoutPricing } from "@/features/transactions/hooks/useCheckoutPricing";
import { useTransactionsPageContext } from "@/features/transactions/lib/transactions-context";
import type { Campaign } from "@/lib/api";
import {
	campaignsQueryOptions,
	paymentMethodsQueryOptions,
} from "@/lib/query-options";
import { cn } from "@/lib/utils";
import { formatIDRCurrency } from "@/shared/utils";

// Step ③ — money, kept together: campaign, manual discount, the running total
// breakdown, and tender. Campaign eligibility ("Usable") and the discount it
// produces stay in one view so the cashier sees its effect on the total live.
export const CheckoutPaymentStep = () => {
	const { visibleStores } = useTransactionsPageContext();
	const { subtotal, campaignBase, pricing } = useCheckoutPricing();
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

	// ADR-0018: an Estimate in the cart makes the Order unpayable at checkout,
	// so every tender except "Pay later" locks instead of bouncing at submit.
	const estimateBlocksPayment = hasEstimateLine(serviceRows);

	// Only campaigns whose rules pass for the current store + the fixed-price
	// subtotal (ADR-0019 — a Repair quote can move after checkout, so it
	// counts for nothing here). Same eligibility filter the old picker used —
	// ineligible ones are hidden.
	// Voucher (code-mode) campaigns are entered by code, never listed as tiles —
	// the server already omits them, but filter defensively so one can't leak in.
	const eligibleCampaigns = useMemo(() => {
		if (selectedStoreNumber === undefined) {
			return [];
		}
		const now = new Date();
		return (campaignsQuery.data ?? []).filter(
			(campaign) =>
				campaign.redemption_mode !== "code" &&
				campaignIneligibilityReason(campaign, {
					now,
					grossTotal: campaignBase,
					storeId: selectedStoreNumber,
				}) === null,
		);
	}, [campaignsQuery.data, selectedStoreNumber, campaignBase]);

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

	// Drop any applied voucher that stopped being eligible (e.g. the fixed-price
	// base fell below its minimum). Mirrors the listed-campaign prune above: a
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
					grossTotal: campaignBase,
					storeId: selectedStoreNumber,
				}) === null,
		);
		if (eligible.length !== appliedVouchers.length) {
			form.setValue("appliedVouchers", eligible, { shouldValidate: true });
		}
	}, [appliedVouchers, campaignBase, selectedStoreNumber, form]);

	// An Estimate added after a tender was picked must clear it — the draft
	// would otherwise submit as paid and hard-fail at the server gate.
	useEffect(() => {
		if (!estimateBlocksPayment) {
			return;
		}
		if (form.getValues("selectedPaymentMethodId") !== "") {
			form.setValue("selectedPaymentMethodId", "", { shouldValidate: true });
		}
	}, [estimateBlocksPayment, form]);

	return (
		<div className="grid gap-5">
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
							storeId={selectedStoreNumber}
							subtotal={campaignBase}
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
									disabled={estimateBlocksPayment}
									isSelected={field.value === option.value}
									key={option.value}
									label={option.label}
									onSelect={() => field.onChange(option.value)}
									value={option.value}
								/>
							))}
						</div>
						{estimateBlocksPayment ? (
							<p className="text-muted-foreground text-xs">
								Order carries an Estimate — pay later only. Payment unlocks once
								the Estimate is confirmed.
							</p>
						) : null}
						<FieldError errors={[fieldState.error]} />
					</FieldSet>
				)}
			/>

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
				{campaignBase !== subtotal ? (
					// Repair is quoted work, not catalogue spend (ADR-0019) — show the
					// number campaigns actually run on so "why no promo?" answers itself.
					<div className="flex items-center justify-between gap-3 text-sm">
						<span className="text-muted-foreground">
							Campaign base · excludes repair
						</span>
						<span className="font-medium">
							{formatIDRCurrency(String(campaignBase))}
						</span>
					</div>
				) : null}
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

const campaignDiscountLabel = (campaign: Campaign): string => {
	if (campaign.discount_type === "fixed") {
		return `-${formatIDRCurrency(String(campaign.discount_value))}`;
	}
	if (campaign.discount_type === "percentage") {
		return `-${campaign.discount_value}%`;
	}
	return `Buy ${campaign.buy_quantity ?? 0} Get ${campaign.free_quantity ?? 0}`;
};

interface CampaignTileGroupProps {
	eligibleCampaigns: Campaign[];
	selectedIds: string[];
	hasStore: boolean;
	onToggle: (campaignId: string) => void;
}

// Empty / no-store states via early returns; otherwise the eligible campaigns as
// a multi-select tile grid (same column layout as the payment tiles).
const CampaignTileGroup = ({
	eligibleCampaigns,
	selectedIds,
	hasStore,
	onToggle,
}: CampaignTileGroupProps) => {
	if (!hasStore) {
		return (
			<p className="text-muted-foreground text-sm">
				Select store first to load campaigns
			</p>
		);
	}

	if (eligibleCampaigns.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No campaigns available</p>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
			{eligibleCampaigns.map((campaign) => {
				const campaignId = String(campaign.id);
				return (
					<CampaignTile
						code={campaign.code}
						discountLabel={campaignDiscountLabel(campaign)}
						isSelected={selectedIds.includes(campaignId)}
						key={campaign.id}
						onToggle={() => onToggle(campaignId)}
					/>
				);
			})}
		</div>
	);
};

interface CampaignTileProps {
	code: string;
	discountLabel: string;
	isSelected: boolean;
	onToggle: () => void;
}

// Multi-select tile (campaigns stack): a visually hidden checkbox wrapped by the
// styled label — native checkbox semantics + keyboard, full tile as the touch
// target. Selected = solid green; the check echoes the state.
const CampaignTile = ({
	code,
	discountLabel,
	isSelected,
	onToggle,
}: CampaignTileProps) => (
	<label
		className={cn(
			"flex min-h-12 cursor-pointer items-center justify-between gap-2 border px-3 py-2 text-left transition active:scale-[0.97] has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring/50",
			isSelected
				? "border-emerald-300/60 bg-emerald-50/70 text-foreground dark:border-emerald-800 dark:bg-emerald-950/30"
				: "border-border/70 text-foreground/80 hover:border-border hover:bg-muted/40",
		)}
	>
		<input
			checked={isSelected}
			className="sr-only"
			onChange={onToggle}
			type="checkbox"
		/>
		<span className="flex flex-col">
			<span className="font-medium text-sm">{code}</span>
			<span
				className={cn(
					"text-[11px]",
					isSelected
						? "text-emerald-700 dark:text-emerald-400"
						: "text-muted-foreground",
				)}
			>
				{discountLabel}
			</span>
		</span>
		{isSelected ? (
			<CheckIcon
				className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
				weight="bold"
			/>
		) : null}
	</label>
);

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
