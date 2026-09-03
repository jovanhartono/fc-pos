import { isDiscountSettled } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
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
import { OrderSectionHeader } from "@/features/orders/components/order-section-header";
import { useOrderPaymentMutation } from "@/features/orders/hooks/useOrderMutations";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import type { OrderActionGates } from "@/features/orders/lib/order-action-gates";
import { flattenOrderLines } from "@/features/orders/lib/order-lines";
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
import { useSheet } from "@/stores/sheet-store";

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
		<OrderSectionHeader
			action={
				detail.payment_status !== "paid" &&
				gates.isPaymentAllowed &&
				!gates.hasUnpricedLine ? (
					<CollectPaymentAction detail={detail} orderId={orderId} />
				) : null
			}
		>
			Payment
		</OrderSectionHeader>
		<div className="border-t">
			<OrderMoneySummary detail={detail} />
		</div>
		<PaymentDetails detail={detail} gates={gates} />
	</Card>
);

// Payment status itself is shown in the header status chip (OrderIdentityStrip),
// so this section adds only the extra detail — how it was paid, or why it
// cannot be collected yet — and renders nothing when there is neither.
const PaymentDetails = ({
	detail,
	gates,
}: Pick<OrderPaymentSectionProps, "detail" | "gates">) => {
	if (detail.payment_status === "paid") {
		return (
			<>
				<Separator />
				<PaidDetails detail={detail} />
			</>
		);
	}
	// ADR-0018: no price, no payment. The server refuses the paid transition
	// while a live line is unpriced — say so here instead of offering a
	// Collect payment button that can only 400.
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
	return null;
};

interface CollectPaymentActionProps {
	orderId: number;
	detail: OrderDetail;
}

const CollectPaymentAction = ({
	orderId,
	detail,
}: CollectPaymentActionProps) => {
	const openSheet = useSheet((s) => s.openSheet);
	// ADR-0018: a discount that settled at drop-off is printed on the Receipt
	// the customer holds, and the server refuses a second one. That desk gets a
	// form with no discount controls at all rather than fields that can only 400.
	const isSettled = isDiscountSettled(detail.discount_source);

	return (
		<Button
			onClick={() =>
				openSheet({
					title: "Collect payment",
					description: detail.code,
					content: () =>
						isSettled ? (
							<SettledDiscountPaymentForm detail={detail} orderId={orderId} />
						) : (
							<CollectPaymentForm detail={detail} orderId={orderId} />
						),
				})
			}
			size="sm"
			type="button"
		>
			Collect payment
		</Button>
	);
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

const paymentMethodSchema = z.object({
	paymentMethodId: z.string().min(1, "Payment method is required."),
});

// The tender picker both payment forms end with. Reads the form through
// context so neither form threads control/errors down to it.
const PaymentMethodField = () => {
	const { control } = useFormContext<z.infer<typeof paymentMethodSchema>>();
	const paymentMethodsQuery = useQuery(paymentMethodsQueryOptions());
	const paymentMethods = Array.isArray(paymentMethodsQuery.data)
		? paymentMethodsQuery.data
		: [];

	return (
		<Controller
			control={control}
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
	);
};

interface ToCollectLineProps {
	amount: number;
}

const ToCollectLine = ({ amount }: ToCollectLineProps) => (
	<div className="flex items-center justify-between gap-4 text-sm font-medium">
		<span>To collect</span>
		<span className="font-mono tabular-nums">{formatMoney(amount)}</span>
	</div>
);

interface SettledDiscountPaymentFormProps {
	orderId: number;
	detail: OrderDetail;
}

// The Order whose discount settled at drop-off (ADR-0018): the amount is
// already on the Receipt, so this desk only books the tender. No campaign
// tiles, no voucher box, no manual discount — the server would refuse every
// one of them, and the cashier had no way to know that from the form.
const SettledDiscountPaymentForm = ({
	orderId,
	detail,
}: SettledDiscountPaymentFormProps) => {
	const closeSheet = useSheet((s) => s.closeSheet);
	const paymentMutation = useOrderPaymentMutation(orderId);
	const form = useForm<z.infer<typeof paymentMethodSchema>>({
		resolver: zodResolver(paymentMethodSchema),
		defaultValues: { paymentMethodId: "" },
	});

	const discount = parseMoney(detail.discount);
	// Mirrors the server: net due = gross − stored discount − already refunded.
	const toCollect = Math.max(
		parseMoney(detail.total) - discount - parseMoney(detail.refunded_amount),
		0,
	);
	return (
		<FormProvider {...form}>
			<form
				className="grid gap-4"
				onSubmit={form.handleSubmit((values) => {
					paymentMutation.mutate(
						{
							payment_method_id: Number(values.paymentMethodId),
							campaign_ids: [],
							voucher_codes: [],
							discount: "0",
						},
						{ onSuccess: () => closeSheet() },
					);
				})}
			>
				{/* Same emerald as a captured drop-off photo: settled is a done state,
				    not a warning. The breakdown itself is on the page under this sheet. */}
				<p className="flex items-start gap-2 border border-emerald-300/60 bg-emerald-50/70 px-3 py-2.5 text-emerald-900 text-sm dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
					<CheckCircleIcon
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
						weight="fill"
					/>
					<span>
						Discount of <strong>{formatMoney(discount)}</strong> settled at
						drop-off. Collect the printed total.
					</span>
				</p>
				<ToCollectLine amount={toCollect} />
				<PaymentMethodField />
				<Button
					className="h-10 pointer-coarse:h-11"
					loading={paymentMutation.isPending}
					type="submit"
				>
					Mark as paid
				</Button>
			</form>
		</FormProvider>
	);
};

// The only rule the form enforces is that a tender was picked. The rest are
// declared, not validated: the tile group and voucher entry only emit entries
// the server already vetted, and CurrencyInput cannot produce a negative —
// the server clamps the discount regardless.
const collectPaymentSchema = paymentMethodSchema.extend({
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
	const closeSheet = useSheet((s) => s.closeSheet);
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
		return flattenOrderLines(detail).flatMap((line) => {
			if (line.status === "cancelled" || line.service === null) {
				return [];
			}
			const catalogPrice = catalogPriceByServiceId.get(line.service.id);
			return catalogPrice == null
				? []
				: [{ price: parseMoney(line.price), service_id: line.service.id }];
		});
	}, [detail, servicesQuery.data]);

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

	return (
		<FormProvider {...form}>
			<form
				className="grid gap-4"
				// mutate, not mutateAsync: on a race (someone else collected first)
				// the global handler shows the server's reason instead of a silent
				// stopped spinner.
				onSubmit={form.handleSubmit((values) => {
					paymentMutation.mutate(
						{
							payment_method_id: Number(values.paymentMethodId),
							campaign_ids: values.campaignIds.map((id) => Number(id)),
							voucher_codes: values.vouchers.map((entry) => entry.code),
							discount: values.discount || "0",
						},
						{ onSuccess: () => closeSheet() },
					);
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
				<ToCollectLine amount={toCollect} />
				<PaymentMethodField />
				<Button
					className="h-10 pointer-coarse:h-11"
					loading={paymentMutation.isPending}
					type="submit"
				>
					Mark as paid
				</Button>
			</form>
		</FormProvider>
	);
};
