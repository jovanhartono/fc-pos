import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { CurrencyInput } from "@/components/form/currency-input";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Field,
	FieldError,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { OrderMoneySummary } from "@/features/orders/components/order-money-summary";
import { OrderRefundAction } from "@/features/orders/components/order-refund-action";
import { OrderSectionHeader } from "@/features/orders/components/order-section-header";
import { useOrderPaymentMutation } from "@/features/orders/hooks/useOrderMutations";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import type { OrderActionGates } from "@/features/orders/lib/order-action-gates";
import {
	type AppliedVoucher,
	getCartPricing,
} from "@/features/transactions/cart/cart";
import { CampaignTileGroup } from "@/features/transactions/components/campaign-tile-group";
import { VoucherCodeEntry } from "@/features/transactions/components/voucher-code-entry";
import { filterEligibleCampaigns } from "@/features/transactions/lib/campaign-eligibility";
import type { OrderDetail } from "@/lib/api";
import {
	campaignsQueryOptions,
	paymentMethodsQueryOptions,
	servicesQueryOptions,
} from "@/lib/query-options";
import { formatMoney, parseMoney } from "@/shared/money";

interface OrderPaymentSectionProps {
	orderId: number;
	detail: OrderDetail;
	gates: OrderActionGates;
}

export const OrderPaymentSection = ({
	orderId,
	detail,
	gates,
}: OrderPaymentSectionProps) => (
	<Card className="gap-0 overflow-hidden py-0">
		<OrderSectionHeader>Payment</OrderSectionHeader>
		<div className="border-t">
			<OrderMoneySummary detail={detail} />
		</div>
		<PaymentDetails detail={detail} gates={gates} orderId={orderId} />
		<OrderRefundAction detail={detail} gates={gates} orderId={orderId} />
	</Card>
);

// Payment status itself is shown in the header status chip (OrderIdentityStrip),
// so this section adds only the extra detail — how it was paid, or the control
// to collect it — and renders nothing when there is neither (unpaid, no rights).
const PaymentDetails = ({
	orderId,
	detail,
	gates,
}: OrderPaymentSectionProps) => {
	if (detail.payment_status === "paid") {
		return (
			<>
				<Separator />
				<PaidDetails detail={detail} />
			</>
		);
	}
	// ADR-0018: no price, no payment. The server refuses the paid transition
	// while a live line is unpriced — say so here instead of offering a form
	// that can only 400.
	if (gates.hasUnpricedLine) {
		return (
			<>
				<Separator />
				<p className="px-4 py-4 text-muted-foreground text-sm">
					A line has no price yet. Set it from the item's detail, then collect
					payment.
				</p>
			</>
		);
	}
	if (gates.isPaymentAllowed) {
		return (
			<>
				<Separator />
				<CollectPaymentForm detail={detail} orderId={orderId} />
			</>
		);
	}
	return null;
};

const PaidDetails = ({ detail }: { detail: OrderDetail }) => (
	<dl className="grid gap-2 px-4 py-4 text-sm">
		<div className="flex items-center justify-between gap-4">
			<dt className="text-muted-foreground">Method</dt>
			<dd className="font-medium">{detail.paymentMethod?.name ?? "—"}</dd>
		</div>
		{detail.paid_at ? (
			<div className="flex items-center justify-between gap-4">
				<dt className="text-muted-foreground">Paid at</dt>
				<dd className="tabular-nums">{formatOrderDateTime(detail.paid_at)}</dd>
			</div>
		) : null}
		{detail.paidBy ? (
			<div className="flex items-center justify-between gap-4">
				<dt className="text-muted-foreground">Marked by</dt>
				<dd className="font-medium">{detail.paidBy.name}</dd>
			</div>
		) : null}
	</dl>
);

// The only rule the form enforces is that a tender was picked. The rest are
// declared, not validated: the tile group and voucher entry only emit entries
// the server already vetted, and CurrencyInput cannot produce a negative —
// the server clamps the discount regardless.
const collectPaymentSchema = z.object({
	paymentMethodId: z.string().min(1, "Payment method is required."),
	campaignIds: z.array(z.string()),
	vouchers: z.array(z.custom<AppliedVoucher>()),
	discount: z.string(),
});

type CollectPaymentValues = z.infer<typeof collectPaymentSchema>;

interface CollectPaymentFormProps {
	orderId: number;
	detail: OrderDetail;
}

// ADR-0018: this desk settles the discount for the Order that came in
// unpriced — the Repair whose number only landed after inspection, so there
// was nothing to settle at drop-off. Campaigns, codes, and a manual discount
// ride the payment PATCH. Every line is priced by now (the unpriced gate
// above), so the order total is the campaign base. An Order whose discount
// already settled shows the printed total instead: the server refuses a
// second claim.
const CollectPaymentForm = ({ orderId, detail }: CollectPaymentFormProps) => {
	const paymentMethodsQuery = useQuery(paymentMethodsQueryOptions());
	const servicesQuery = useQuery(servicesQueryOptions());
	const campaignsQuery = useQuery(
		campaignsQueryOptions({
			store_id: detail.store_id ?? undefined,
			is_active: true,
		}),
	);
	const paymentMutation = useOrderPaymentMutation(orderId);

	const form = useForm<CollectPaymentValues>({
		resolver: zodResolver(collectPaymentSchema),
		defaultValues: {
			paymentMethodId: "",
			campaignIds: [],
			vouchers: [],
			discount: "",
		},
	});
	const [campaignIds = [], vouchers = [], discount = ""] = useWatch<
		CollectPaymentValues,
		["campaignIds", "vouchers", "discount"]
	>({
		control: form.control,
		name: ["campaignIds", "vouchers", "discount"],
	});

	const grossTotal = parseMoney(detail.total);
	const refunded = parseMoney(detail.refunded_amount);
	const storeId = detail.store_id ?? undefined;

	// Same eligibility filter the POS checkout uses, against the order total.
	const eligibleCampaigns = useMemo(
		() => filterEligibleCampaigns(campaignsQuery.data, { grossTotal, storeId }),
		[campaignsQuery.data, storeId, grossTotal],
	);

	// BOGO free slots come from catalog-priced lines only (ADR-0018) — a
	// no-list-price line (Repair) is never given away. The order detail names
	// each line's Service without its catalog price, so look it up.
	const serviceLines = useMemo(() => {
		const catalogPriceByServiceId = new Map(
			(servicesQuery.data ?? []).map((service) => [service.id, service.price]),
		);
		return detail.services.flatMap((line) => {
			if (line.status === "cancelled" || line.service === null) {
				return [];
			}
			const catalogPrice = catalogPriceByServiceId.get(line.service.id);
			return catalogPrice == null
				? []
				: [{ price: parseMoney(line.price), service_id: line.service.id }];
		});
	}, [detail.services, servicesQuery.data]);

	const pricing = useMemo(
		() =>
			getCartPricing({
				subtotal: grossTotal,
				campaigns: [
					...eligibleCampaigns.filter((campaign) =>
						campaignIds.includes(String(campaign.id)),
					),
					...vouchers.map((entry) => entry.campaign),
				],
				serviceLines,
				manualDiscount: discount,
			}),
		[
			grossTotal,
			eligibleCampaigns,
			campaignIds,
			vouchers,
			serviceLines,
			discount,
		],
	);
	// Mirrors the server: net due = gross − discount − already refunded.
	const toCollect = Math.max(pricing.total - refunded, 0);

	const paymentMethods = Array.isArray(paymentMethodsQuery.data)
		? paymentMethodsQuery.data
		: [];

	return (
		<form
			className="grid gap-4 px-4 py-4"
			// mutate, not mutateAsync: on a race (someone else collected first)
			// the global handler shows the server's reason instead of a silent
			// stopped spinner.
			onSubmit={form.handleSubmit((values) => {
				paymentMutation.mutate({
					payment_method_id: Number(values.paymentMethodId),
					campaign_ids: values.campaignIds.map((id) => Number(id)),
					voucher_codes: values.vouchers.map((entry) => entry.code),
					discount: values.discount || "0",
				});
			})}
		>
			<Controller
				control={form.control}
				name="campaignIds"
				render={({ field }) => (
					<FieldSet className="gap-2">
						<FieldLegend variant="label">Campaigns</FieldLegend>
						<CampaignTileGroup
							eligibleCampaigns={eligibleCampaigns}
							hasStore={storeId !== undefined}
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
							appliedVouchers={vouchers}
							onChange={(next) =>
								form.setValue("vouchers", next, {
									shouldDirty: true,
									shouldValidate: true,
								})
							}
							storeId={storeId}
							subtotal={grossTotal}
						/>
					</FieldSet>
				)}
			/>

			<Controller
				control={form.control}
				name="discount"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="collect-payment-discount">
							Manual Discount
						</FieldLabel>
						<CurrencyInput
							id="collect-payment-discount"
							onValueChange={field.onChange}
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>

			{pricing.totalDiscount > 0 ? (
				<dl className="grid gap-1.5 text-sm tabular-nums">
					{pricing.campaignBreakdown.map(({ campaign, amount }) => (
						<div className="flex justify-between gap-4" key={campaign.id}>
							<dt className="text-muted-foreground">
								{campaign.code} ({campaign.name})
							</dt>
							<dd className="font-mono text-destructive">
								-{formatMoney(amount)}
							</dd>
						</div>
					))}
					{pricing.manualDiscount > 0 ? (
						<div className="flex justify-between gap-4">
							<dt className="text-muted-foreground">Manual Discount</dt>
							<dd className="font-mono text-destructive">
								-{formatMoney(pricing.manualDiscount)}
							</dd>
						</div>
					) : null}
				</dl>
			) : null}
			<div className="flex items-center justify-between gap-4 text-sm font-medium">
				<span>To collect</span>
				<span className="font-mono tabular-nums">{formatMoney(toCollect)}</span>
			</div>

			<Controller
				control={form.control}
				name="paymentMethodId"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel className="sr-only" htmlFor="collect-payment-method">
							Payment method
						</FieldLabel>
						<SelectField
							className="w-full"
							id="collect-payment-method"
							items={paymentMethods.map((method) => ({
								value: String(method.id),
								label: method.name,
							}))}
							onValueChange={field.onChange}
							placeholder="Select payment method"
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Button
				className="h-10 pointer-coarse:h-11"
				loading={paymentMutation.isPending}
				type="submit"
			>
				Mark as paid
			</Button>
		</form>
	);
};
