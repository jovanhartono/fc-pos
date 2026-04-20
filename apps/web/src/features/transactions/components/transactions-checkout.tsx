import {
	CreditCardIcon,
	ReceiptIcon,
	ShoppingCartIcon,
	StorefrontIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { CurrencyInput } from "@/components/form/currency-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { CampaignAutocomplete } from "@/features/orders/components/campaign-autocomplete";
import { CustomerAutocomplete } from "@/features/orders/components/customer-autocomplete";
import { useCartTotals } from "@/features/transactions/hooks/use-cart-totals";
import { useTransactionsCart } from "@/features/transactions/hooks/use-transactions-cart";
import {
	getEntityCategoryName,
	getStackedDiscount,
	isCampaignAvailable,
	type TransactionDraftValues,
} from "@/features/transactions/lib/transactions";
import { useTransactionsPageContext } from "@/features/transactions/lib/transactions-context";
import {
	campaignsQueryOptions,
	categoriesQueryOptions,
	paymentMethodsQueryOptions,
} from "@/lib/query-options";
import { cn } from "@/lib/utils";
import { formatIDRCurrency } from "@/shared/utils";
import { useTransactionsPageStore } from "@/stores/transactions-store";

interface TransactionsCheckoutProps {
	isInSheet?: boolean;
}

type OrderMetaBadgeProps = {
	label: string;
	value: string;
	variant?: "outline" | "secondary" | "success" | "warning";
};

function OrderMetaBadge({
	label,
	value,
	variant = "outline",
}: OrderMetaBadgeProps) {
	return (
		<div className="border border-border/70 bg-muted/20 px-3 py-2">
			<p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
				{label}
			</p>
			<div className="mt-1 flex items-center gap-2">
				<Badge variant={variant}>{value}</Badge>
			</div>
		</div>
	);
}

export function TransactionsCheckout({
	isInSheet = false,
}: TransactionsCheckoutProps) {
	const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
	const { visibleStores, submit } = useTransactionsPageContext();
	const {
		resetCart,
		removeProductFromCart,
		removeServiceFromCart,
		updateProductQty,
		updateServiceField,
	} = useTransactionsCart();
	const submitError = useTransactionsPageStore((state) => state.submitError);

	const form = useFormContext<TransactionDraftValues>();
	const [
		selectedCustomerId = "",
		selectedCampaignIds = [],
		selectedPaymentMethodId = "",
		paymentStatus = "unpaid",
		manualDiscount = "",
		selectedStoreId = "",
	] = useWatch({
		control: form.control,
		name: [
			"selectedCustomerId",
			"selectedCampaignIds",
			"selectedPaymentMethodId",
			"paymentStatus",
			"manualDiscount",
			"selectedStoreId",
		],
	});

	const { cartProductRows, cartServiceRows, subtotal, cartCount } =
		useCartTotals();

	useEffect(() => {
		if (isInSheet) {
			return;
		}
		const handleKeydown = (event: KeyboardEvent) => {
			if (
				event.key !== "Enter" ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey
			) {
				return;
			}
			if (paymentSheetOpen || cartCount === 0) {
				return;
			}
			const target = event.target as HTMLElement | null;
			const isTyping =
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.tagName === "SELECT" ||
				target?.isContentEditable;
			if (isTyping) {
				return;
			}
			event.preventDefault();
			setPaymentSheetOpen(true);
		};
		window.addEventListener("keydown", handleKeydown);
		return () => window.removeEventListener("keydown", handleKeydown);
	}, [cartCount, isInSheet, paymentSheetOpen]);

	const selectedStoreNumber =
		selectedStoreId && Number.isFinite(Number(selectedStoreId))
			? Number(selectedStoreId)
			: undefined;

	const categoriesQuery = useQuery(categoriesQueryOptions());
	const paymentMethodsQuery = useQuery(paymentMethodsQueryOptions());
	const campaignsQuery = useQuery({
		...campaignsQueryOptions({
			store_id: selectedStoreNumber,
			is_active: true,
		}),
		enabled: selectedStoreNumber !== undefined,
	});

	const categories = categoriesQuery.data ?? [];
	const paymentMethods = paymentMethodsQuery.data ?? [];
	const availableCampaigns = useMemo(() => {
		const now = new Date();
		return (campaignsQuery.data ?? []).filter((campaign) =>
			isCampaignAvailable(campaign, now),
		);
	}, [campaignsQuery.data]);

	const categoryMap = useMemo(
		() => new Map(categories.map((category) => [category.id, category])),
		[categories],
	);

	const paymentMethodOptions = useMemo<ComboboxOption[]>(
		() => [
			{ value: "none", label: "No payment method" },
			...paymentMethods.map((paymentMethod) => ({
				value: String(paymentMethod.id),
				label: paymentMethod.name,
			})),
		],
		[paymentMethods],
	);

	const selectedStore = useMemo(
		() =>
			selectedStoreNumber
				? visibleStores.find((store) => store.id === selectedStoreNumber)
				: undefined,
		[selectedStoreNumber, visibleStores],
	);
	const selectedCampaigns = useMemo(() => {
		const selectedIdSet = new Set(selectedCampaignIds);
		return availableCampaigns.filter((campaign) =>
			selectedIdSet.has(String(campaign.id)),
		);
	}, [availableCampaigns, selectedCampaignIds]);
	const selectedPaymentMethodLabel = useMemo(
		() =>
			selectedPaymentMethodId
				? paymentMethodOptions.find(
						(option) => option.value === selectedPaymentMethodId,
					)?.label
				: undefined,
		[paymentMethodOptions, selectedPaymentMethodId],
	);

	const stackedDiscount = useMemo(
		() => getStackedDiscount(subtotal, selectedCampaigns),
		[subtotal, selectedCampaigns],
	);
	const campaignDiscount = stackedDiscount.total;
	const discountValue = Number(manualDiscount || 0);
	const totalDiscount = Math.min(subtotal, discountValue + campaignDiscount);
	const total = Math.max(0, subtotal - totalDiscount);

	const isSubmitting = form.formState.isSubmitting;

	const campaignSummary =
		selectedCampaigns.length === 0
			? "None"
			: selectedCampaigns.length === 1
				? (selectedCampaigns[0]?.code ?? "1 applied")
				: `${selectedCampaigns.length} applied`;

	const paymentValue =
		paymentStatus === "paid"
			? (selectedPaymentMethodLabel ?? "Method required")
			: "Unpaid";
	const campaignVariant = selectedCampaigns.length > 0 ? "success" : "outline";
	const paymentVariant = paymentStatus === "paid" ? "warning" : "outline";

	return (
		<>
			<div
				className={cn(
					"grid gap-5",
					!isInSheet && "xl:sticky xl:top-0 xl:self-start",
				)}
			>
				<Card
					className={cn(
						"border-border/70",
						isInSheet && "rounded-none border-0 bg-transparent shadow-none",
					)}
				>
					<CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
						<div>
							<CardTitle className="flex items-center gap-2">
								<ShoppingCartIcon className="size-4" />
								Cart Summary
							</CardTitle>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={resetCart}
							disabled={
								cartCount === 0 &&
								!selectedCustomerId &&
								selectedCampaignIds.length === 0
							}
							icon={<TrashIcon className="size-4" />}
						>
							Reset
						</Button>
					</CardHeader>
					<CardContent className="grid gap-5">
						<Controller
							name="selectedCustomerId"
							control={form.control}
							render={({ field, fieldState }) => (
								<CustomerAutocomplete
									value={field.value}
									onValueChange={field.onChange}
									error={fieldState.error}
									required
								/>
							)}
						/>
						<div className="grid max-h-[52vh] gap-3 overflow-y-auto pr-2">
							{cartProductRows.length === 0 && cartServiceRows.length === 0 ? (
								<div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
									Cart is empty.
								</div>
							) : null}

							{cartProductRows.map((line) => (
								<div
									key={`product-${line.id}`}
									className="grid gap-3 border border-border/70 p-3"
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="text-sm font-medium">{line.product.name}</p>
											<p className="text-xs text-muted-foreground">
												Product |{" "}
												{getEntityCategoryName(line.product, categoryMap)}
											</p>
										</div>
										<Button
											type="button"
											variant="outline"
											size="icon-xs"
											onClick={() => removeProductFromCart(line.id)}
											icon={<XIcon className="size-4" />}
										/>
									</div>
									<div className="flex items-center justify-between gap-3">
										<div className="flex items-center gap-2">
											<Button
												type="button"
												variant="outline"
												size="icon-xs"
												onClick={() =>
													updateProductQty(
														line.id,
														line.qty - 1,
														Number(line.product.stock ?? line.qty),
													)
												}
											>
												-
											</Button>
											<div className="min-w-10 text-center text-sm font-medium">
												{line.qty}
											</div>
											<Button
												type="button"
												variant="outline"
												size="icon-xs"
												onClick={() =>
													updateProductQty(
														line.id,
														line.qty + 1,
														Number(line.product.stock ?? line.qty),
													)
												}
												disabled={
													line.qty >= Number(line.product.stock ?? line.qty)
												}
											>
												+
											</Button>
										</div>
										<p className="text-sm font-semibold">
											{formatIDRCurrency(
												String(Number(line.product.price) * line.qty),
											)}
										</p>
									</div>
								</div>
							))}

							{cartServiceRows.map((line, index) => (
								<div
									key={line.line_id}
									className="grid gap-3 border border-border/70 p-3"
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="text-sm font-medium">{line.service.name}</p>
											<p className="text-xs text-muted-foreground">
												Service |{" "}
												{getEntityCategoryName(line.service, categoryMap)}
											</p>
										</div>
										<Button
											type="button"
											variant="outline"
											size="icon-xs"
											onClick={() => removeServiceFromCart(line.line_id)}
											icon={<XIcon className="size-4" />}
										/>
									</div>
									<div className="grid gap-3 sm:grid-cols-2">
										<Field>
											<FieldLabel htmlFor={`service-color-${line.line_id}`}>
												Color
											</FieldLabel>
											<Input
												id={`service-color-${line.line_id}`}
												value={line.color}
												onChange={(event) =>
													updateServiceField(
														line.line_id,
														"color",
														event.target.value,
													)
												}
												placeholder="e.g. Black"
											/>
										</Field>
										<Field
											data-invalid={
												!!form.formState.errors.serviceCart?.[index]?.brand
											}
										>
											<FieldLabel htmlFor={`service-brand-${line.line_id}`}>
												Brand
											</FieldLabel>
											<Input
												id={`service-brand-${line.line_id}`}
												value={line.brand}
												onChange={(event) =>
													updateServiceField(
														line.line_id,
														"brand",
														event.target.value,
													)
												}
												placeholder="e.g. Adidas"
											/>
											<FieldError
												errors={[
													form.formState.errors.serviceCart?.[index]?.brand,
												]}
											/>
										</Field>
										<Field
											data-invalid={
												!!form.formState.errors.serviceCart?.[index]?.model
											}
										>
											<FieldLabel htmlFor={`service-model-${line.line_id}`}>
												Model
											</FieldLabel>
											<Input
												id={`service-model-${line.line_id}`}
												value={line.model}
												onChange={(event) =>
													updateServiceField(
														line.line_id,
														"model",
														event.target.value,
													)
												}
												placeholder="e.g. Yeezy"
											/>
											<FieldError
												errors={[
													form.formState.errors.serviceCart?.[index]?.model,
												]}
											/>
										</Field>
										<Field
											data-invalid={
												!!form.formState.errors.serviceCart?.[index]?.size
											}
										>
											<FieldLabel htmlFor={`service-size-${line.line_id}`}>
												Size
											</FieldLabel>
											<Input
												id={`service-size-${line.line_id}`}
												value={line.size}
												onChange={(event) =>
													updateServiceField(
														line.line_id,
														"size",
														event.target.value,
													)
												}
												placeholder="e.g. 42"
											/>
											<FieldError
												errors={[
													form.formState.errors.serviceCart?.[index]?.size,
												]}
											/>
										</Field>
									</div>
									<div className="flex items-center justify-end gap-3">
										<p className="text-sm font-semibold">
											{formatIDRCurrency(String(line.service.price))}
										</p>
									</div>
								</div>
							))}
						</div>

						<div className="grid gap-4 border-t border-border/70 pt-4">
							<div className="grid gap-3 border border-border/70 p-4">
								<div className="flex items-center justify-between gap-3 text-sm">
									<div className="flex items-center gap-2">
										<StorefrontIcon className="size-4 text-muted-foreground" />
										<span className="text-muted-foreground">Store</span>
									</div>
									<span className="font-medium">
										{selectedStore?.name ?? "-"}
									</span>
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
								{stackedDiscount.breakdown.map(({ campaign, amount }) => (
									<div
										key={campaign.id}
										className="flex items-center justify-between gap-3 text-sm"
									>
										<span className="text-muted-foreground">
											{campaign.code} ({campaign.name})
										</span>
										<span className="font-medium">
											-{formatIDRCurrency(String(amount))}
										</span>
									</div>
								))}
								<div className="flex items-center justify-between gap-3 text-sm">
									<span className="text-muted-foreground">Manual Discount</span>
									<span className="font-medium">
										-{formatIDRCurrency(String(discountValue))}
									</span>
								</div>
								<div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-base font-semibold">
									<span>Total Payment</span>
									<span>{formatIDRCurrency(String(Math.round(total)))}</span>
								</div>
							</div>

							<div className="grid gap-2 sm:grid-cols-3">
								<OrderMetaBadge
									label="Campaign"
									value={campaignSummary}
									variant={campaignVariant}
								/>
								<OrderMetaBadge
									label="Payment"
									value={paymentValue}
									variant={paymentVariant}
								/>
							</div>

							{submitError ? <FieldError>{submitError}</FieldError> : null}

							<Button
								type="button"
								size="lg"
								onClick={() => setPaymentSheetOpen(true)}
								disabled={cartCount === 0}
								icon={<CreditCardIcon className="size-4" />}
							>
								<span className="flex w-full items-center justify-center gap-2">
									Review Checkout
									<kbd className="hidden items-center justify-center border border-border/60 bg-background/10 px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline-flex">
										⏎
									</kbd>
								</span>
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			<Sheet open={paymentSheetOpen} onOpenChange={setPaymentSheetOpen}>
				<SheetContent className="w-full sm:max-w-xl!">
					<SheetHeader className="border-b border-border/70">
						<SheetTitle>Payment & Customer</SheetTitle>
						<SheetDescription>
							Finalize customer, campaign, payment, and notes after the order
							lines are correct.
						</SheetDescription>
					</SheetHeader>

					<div className="grid gap-5 overflow-y-auto p-4">
						<Controller
							name="selectedCampaignIds"
							control={form.control}
							render={({ field, fieldState }) => (
								<CampaignAutocomplete
									id="transaction-campaign"
									label="Campaigns"
									storeId={selectedStoreId}
									values={field.value}
									onValuesChange={field.onChange}
									error={fieldState.error}
								/>
							)}
						/>

						<Controller
							name="selectedPaymentMethodId"
							control={form.control}
							render={({ field, fieldState }) => (
								<Field data-invalid={fieldState.invalid}>
									<FieldLabel htmlFor="transaction-payment-method">
										Payment Method
									</FieldLabel>
									<Combobox
										id="transaction-payment-method"
										triggerClassName="h-10 w-full text-sm"
										options={paymentMethodOptions}
										value={field.value || "none"}
										onValueChange={(value) =>
											field.onChange(value === "none" ? "" : value)
										}
										loading={paymentMethodsQuery.isFetching}
										placeholder="No payment method"
										searchPlaceholder="Search payment method..."
										emptyText="No payment method found"
									/>
									<FieldError errors={[fieldState.error]} />
								</Field>
							)}
						/>

						<Controller
							name="paymentStatus"
							control={form.control}
							render={({ field, fieldState }) => (
								<Field data-invalid={fieldState.invalid}>
									<FieldLabel>Payment Status</FieldLabel>
									<div className="grid grid-cols-2 gap-2">
										<Button
											type="button"
											variant={field.value === "unpaid" ? "default" : "outline"}
											onClick={() => field.onChange("unpaid")}
										>
											Unpaid
										</Button>
										<Button
											type="button"
											variant={field.value === "paid" ? "default" : "outline"}
											onClick={() => field.onChange("paid")}
										>
											Paid
										</Button>
									</div>
									<FieldError errors={[fieldState.error]} />
								</Field>
							)}
						/>

						{selectedCampaigns.length > 0 ? (
							<div className="grid gap-2">
								{selectedCampaigns.map((campaign) => (
									<div
										key={campaign.id}
										className="flex items-center justify-between gap-3 border border-emerald-300/60 bg-emerald-50/70 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30"
									>
										<div>
											<p className="font-medium">{campaign.name}</p>
											<p className="text-xs text-muted-foreground">
												{campaign.code} active on this store
											</p>
										</div>
										<Badge variant="success">
											{campaign.discount_type === "percentage"
												? `${campaign.discount_value}%`
												: formatIDRCurrency(String(campaign.discount_value))}
										</Badge>
									</div>
								))}
							</div>
						) : null}

						<Controller
							name="manualDiscount"
							control={form.control}
							render={({ field, fieldState }) => (
								<Field data-invalid={fieldState.invalid}>
									<FieldLabel htmlFor="transaction-discount">
										Manual Discount
									</FieldLabel>
									<CurrencyInput
										id="transaction-discount"
										value={field.value}
										onValueChange={field.onChange}
									/>
									<FieldError errors={[fieldState.error]} />
								</Field>
							)}
						/>

						<Controller
							name="notes"
							control={form.control}
							render={({ field, fieldState }) => (
								<Field data-invalid={fieldState.invalid}>
									<FieldLabel htmlFor="transaction-notes">Notes</FieldLabel>
									<Textarea
										id="transaction-notes"
										value={field.value}
										onChange={field.onChange}
										placeholder="Add notes"
									/>
									<FieldError errors={[fieldState.error]} />
								</Field>
							)}
						/>

						<div className="grid gap-2 border border-border/70 p-4">
							<div className="flex items-center justify-between gap-3 text-sm">
								<span className="text-muted-foreground">Subtotal</span>
								<span className="font-medium">
									{formatIDRCurrency(String(subtotal))}
								</span>
							</div>
							<div className="flex items-center justify-between gap-3 text-sm">
								<span className="text-muted-foreground">Campaign Discount</span>
								<span className="font-medium">
									-{formatIDRCurrency(String(Math.round(campaignDiscount)))}
								</span>
							</div>
							<div className="flex items-center justify-between gap-3 text-sm">
								<span className="text-muted-foreground">Manual Discount</span>
								<span className="font-medium">
									-{formatIDRCurrency(String(discountValue))}
								</span>
							</div>
							<div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-base font-semibold">
								<span>Total Payment</span>
								<span>{formatIDRCurrency(String(Math.round(total)))}</span>
							</div>
						</div>

						{submitError ? <FieldError>{submitError}</FieldError> : null}
					</div>

					<SheetFooter className="border-t border-border/70">
						<Button
							type="button"
							variant="outline"
							onClick={() => setPaymentSheetOpen(false)}
						>
							Back to Cart
						</Button>
						<Button
							type="button"
							onClick={submit}
							loading={isSubmitting}
							loadingText="Creating order..."
							disabled={cartCount === 0}
						>
							Create Order
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</>
	);
}
