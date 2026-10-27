import {
	isBogoSlot,
	isDiscountSettled,
	orderNetDue,
} from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { TextSkeleton } from "@/components/text-skeleton";
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
import { campaignsQueries } from "@/features/campaigns/api";
import type { OrderDetail } from "@/features/orders/api";
import {
	OrderMoneySummary,
	OrderMoneySummarySkeleton,
} from "@/features/orders/components/order-money-summary";
import { OrderSectionHeader } from "@/features/orders/components/order-section-header";
import { useOrderPaymentMutation } from "@/features/orders/hooks/useOrderMutations";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import type { OrderActionGates } from "@/features/orders/lib/order-action-gates";
import { flattenOrderLines } from "@/features/orders/lib/order-lines";
import { paymentMethodsQueries } from "@/features/payment-methods/api";
import {
	type AppliedVoucher,
	getCartPricing,
} from "@/features/transactions/cart/cart";
import { CampaignTileGroup } from "@/features/transactions/components/campaign-tile-group";
import { VoucherCodeEntry } from "@/features/transactions/components/voucher-code-entry";
import { filterEligibleCampaigns } from "@/features/transactions/lib/campaign-eligibility";
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
	<section className="grid gap-3">
		<OrderSectionHeader
			action={
				gates.canCollectPayment ? (
					<CollectPaymentAction detail={detail} orderId={orderId} />
				) : null
			}
		>
			Payment
		</OrderSectionHeader>
		<Card className="gap-0 overflow-hidden py-0">
			<OrderMoneySummary detail={detail} />
			<PaymentDetails detail={detail} gates={gates} />
		</Card>
	</section>
);

const PAID_LIST = "grid gap-2 px-4 py-4 text-body compact:text-subhead";
const PAID_ROW = "flex items-center justify-between gap-4";

// A paid Order's bill and how it was paid, the shape most open Orders show.
export const OrderPaymentSkeleton = () => (
	<section className="grid gap-3">
		<OrderSectionHeader>Payment</OrderSectionHeader>
		<Card className="gap-0 overflow-hidden py-0">
			<OrderMoneySummarySkeleton />
			<Separator />
			<dl className={PAID_LIST}>
				{["Method", "Paid at", "Marked by"].map((label) => (
					<div className={PAID_ROW} key={label}>
						<dt className="text-muted-foreground">{label}</dt>
						<dd>
							<TextSkeleton className="w-24" />
						</dd>
					</div>
				))}
			</dl>
		</Card>
	</section>
);

// Payment status already shows in the header chip, so this adds only how it
// was paid or why it can't be collected yet.
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
	// ADR-0018: no price, no payment. Say so rather than offer a Collect payment
	// button the server would refuse.
	if (gates.hasUnpricedLine) {
		return (
			<>
				<Separator />
				<p className="px-4 py-4 text-muted-foreground text-body compact:text-subhead">
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
	const openNestedSheet = useSheet((s) => s.openNestedSheet);
	// ADR-0018: a discount settled at drop-off is already on the Customer's
	// Receipt and the server refuses a second, so that form has no discount fields.
	const isSettled = isDiscountSettled(detail.discount_source);

	return (
		<Button
			onClick={() =>
				openNestedSheet({
					title: "Collect Payment",
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
			Collect Payment
		</Button>
	);
};

const PaidDetails = ({ detail }: { detail: OrderDetail }) => (
	<dl className={PAID_LIST}>
		<div className={PAID_ROW}>
			<dt className="text-muted-foreground">Method</dt>
			<dd className="font-medium">{detail.paymentMethod?.name ?? "—"}</dd>
		</div>
		{detail.paid_at ? (
			<div className={PAID_ROW}>
				<dt className="text-muted-foreground">Paid at</dt>
				<dd className="tabular-nums">{formatOrderDateTime(detail.paid_at)}</dd>
			</div>
		) : null}
		{detail.paidBy ? (
			<div className={PAID_ROW}>
				<dt className="text-muted-foreground">Marked by</dt>
				<dd className="font-medium">{detail.paidBy.name}</dd>
			</div>
		) : null}
	</dl>
);

const paymentMethodSchema = z.object({
	paymentMethodId: z.string().min(1, "Payment method is required"),
});

const PaymentMethodField = () => {
	const { control } = useFormContext<z.infer<typeof paymentMethodSchema>>();
	const paymentMethodsQuery = useQuery(paymentMethodsQueries.list());
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
	<div className="flex items-center justify-between gap-4 text-body font-medium">
		<span>To collect</span>
		<span className="tabular-nums">{formatMoney(amount)}</span>
	</div>
);

interface SettledDiscountPaymentFormProps {
	orderId: number;
	detail: OrderDetail;
}

// ADR-0018: the discount is already on the Receipt, so this form only books
// the PaymentMethod.
const SettledDiscountPaymentForm = ({
	orderId,
	detail,
}: SettledDiscountPaymentFormProps) => {
	const goBack = useSheet((s) => s.goBack);
	const paymentMutation = useOrderPaymentMutation(orderId);
	const form = useForm<z.infer<typeof paymentMethodSchema>>({
		resolver: zodResolver(paymentMethodSchema),
		defaultValues: { paymentMethodId: "" },
	});

	const discount = parseMoney(detail.discount);
	const toCollect = orderNetDue({
		grossTotal: parseMoney(detail.total),
		discount,
		refunded: parseMoney(detail.refunded_amount),
	});
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
						{ onSuccess: () => goBack() },
					);
				})}
			>
				{/* Same emerald as a captured drop-off photo: settled is a done state,
				    not a warning. The breakdown itself is on the page under this sheet. */}
				<p className="flex items-start gap-2 rounded-md border border-success/40 bg-tone-good px-3 py-2.5 text-foreground text-body">
					<HugeiconsIcon
						icon={CheckmarkCircle02Icon}
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0 text-tone-good-foreground"
					/>
					<span>
						Discount of <strong>{formatMoney(discount)}</strong> settled at
						drop-off. Collect the printed total.
					</span>
				</p>
				<ToCollectLine amount={toCollect} />
				<PaymentMethodField />
				<Button size="lg" loading={paymentMutation.isPending} type="submit">
					Mark as Paid
				</Button>
			</form>
		</FormProvider>
	);
};

// Only the PaymentMethod is checked: the Campaign and Voucher pickers emit
// only what the server vetted, and the server clamps the discount anyway.
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

// ADR-0018: an Order that came in unpriced, like a Repair priced after
// inspection, settles its discounts here with the payment.
const CollectPaymentForm = ({ orderId, detail }: CollectPaymentFormProps) => {
	const goBack = useSheet((s) => s.goBack);
	const campaignsQuery = useQuery(
		campaignsQueries.list({
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

	// The server's own BOGO slot rule, so the preview matches what payment settles.
	const serviceLines = useMemo(() => {
		return flattenOrderLines(detail).flatMap((line) =>
			line.service !== null && isBogoSlot(line)
				? [{ price: parseMoney(line.price), service_id: line.service.id }]
				: [],
		);
	}, [detail]);

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
	const toCollect = orderNetDue({
		grossTotal,
		discount: pricing.totalDiscount,
		refunded,
	});

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
						{ onSuccess: () => goBack() },
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
								isLoading={campaignsQuery.isPending}
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
								Manual discount
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
					<dl className="grid gap-1.5 text-body tabular-nums">
						{pricing.campaignBreakdown.map(({ campaign, amount }) => (
							<div className="flex justify-between gap-4" key={campaign.id}>
								<dt className="text-muted-foreground">
									{campaign.code} ({campaign.name})
								</dt>
								<dd className="text-destructive tabular-nums">
									-{formatMoney(amount)}
								</dd>
							</div>
						))}
						{pricing.manualDiscount > 0 ? (
							<div className="flex justify-between gap-4">
								<dt className="text-muted-foreground">Manual discount</dt>
								<dd className="text-destructive tabular-nums">
									-{formatMoney(pricing.manualDiscount)}
								</dd>
							</div>
						) : null}
					</dl>
				) : null}
				<ToCollectLine amount={toCollect} />
				<PaymentMethodField />
				<Button size="lg" loading={paymentMutation.isPending} type="submit">
					Mark as Paid
				</Button>
			</form>
		</FormProvider>
	);
};
