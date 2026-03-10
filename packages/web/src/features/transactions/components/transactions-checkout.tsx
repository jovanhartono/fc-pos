import {
	CreditCard,
	Receipt,
	ShoppingCart,
	Storefront,
	Trash,
	X,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
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
import { CustomerAutocomplete } from "@/features/orders/components/customer-autocomplete";
import type {
	ProductCartDisplayLine,
	ServiceCartDisplayLine,
	TransactionDraftValues,
} from "@/features/transactions/lib/transactions";
import { getEntityCategoryName } from "@/features/transactions/lib/transactions";
import type { Campaign, Category, Store } from "@/lib/api";
import { formatIDRCurrency } from "@/shared/utils";

type TransactionsCheckoutProps = {
	form: UseFormReturn<TransactionDraftValues>;
	selectedStore?: Store;
	selectedStoreNumber?: number;
	selectedPaymentMethodLabel?: string;
	selectedCampaign?: Campaign;
	paymentStatus: "paid" | "unpaid";
	cartCount: number;
	submitError: string;
	campaignOptions: ComboboxOption[];
	paymentMethodOptions: ComboboxOption[];
	campaignsLoading: boolean;
	paymentMethodsLoading: boolean;
	cartProductRows: ProductCartDisplayLine[];
	cartServiceRows: ServiceCartDisplayLine[];
	categoryMap: Map<number, Category>;
	campaignDiscount: number;
	discountValue: number;
	subtotal: number;
	total: number;
	isSubmitting: boolean;
	onResetCart: () => void;
	onRemoveProduct: (productId: number) => void;
	onUpdateProductQty: (
		productId: number,
		nextQty: number,
		maxStock: number,
	) => void;
	onRemoveService: (lineId: string) => void;
	onUpdateServiceColor: (lineId: string, value: string) => void;
	onUpdateServiceBrand: (lineId: string, value: string) => void;
	onUpdateServiceSize: (lineId: string, value: string) => void;
	onSubmit: () => void;
};

function OrderMetaBadge({
	label,
	value,
	variant = "outline",
}: {
	label: string;
	value: string;
	variant?: "outline" | "secondary" | "success" | "warning";
}) {
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
	form,
	selectedStore,
	selectedStoreNumber,
	selectedPaymentMethodLabel,
	selectedCampaign,
	paymentStatus,
	cartCount,
	submitError,
	campaignOptions,
	paymentMethodOptions,
	campaignsLoading,
	paymentMethodsLoading,
	cartProductRows,
	cartServiceRows,
	categoryMap,
	campaignDiscount,
	discountValue,
	subtotal,
	total,
	isSubmitting,
	onResetCart,
	onRemoveProduct,
	onUpdateProductQty,
	onRemoveService,
	onUpdateServiceColor,
	onUpdateServiceBrand,
	onUpdateServiceSize,
	onSubmit,
}: TransactionsCheckoutProps) {
	const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
	const selectedCustomerId = form.watch("selectedCustomerId");
	const selectedCampaignId = form.watch("selectedCampaignId");

	const orderMeta = useMemo(
		() => [
			{
				label: "Campaign",
				value: selectedCampaign?.code ?? "None",
				variant: selectedCampaignId
					? ("success" as const)
					: ("outline" as const),
			},
			{
				label: "Payment",
				value:
					paymentStatus === "paid"
						? (selectedPaymentMethodLabel ?? "Method required")
						: "Unpaid",
				variant:
					paymentStatus === "paid"
						? ("warning" as const)
						: ("outline" as const),
			},
		],
		[
			paymentStatus,
			selectedCampaign?.code,
			selectedCampaignId,
			selectedPaymentMethodLabel,
		],
	);

	return (
		<>
			<div className="grid gap-5 xl:sticky xl:top-24 xl:self-start">
				<Card className="border-border/70">
					<CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
						<div>
							<CardTitle className="flex items-center gap-2">
								<ShoppingCart className="size-4" weight="duotone" />
								Cart Summary
							</CardTitle>
							<p className="mt-1 text-sm text-muted-foreground">
								{selectedStore ? selectedStore.name : "Select store"} |{" "}
								{cartCount} item
								{cartCount === 1 ? "" : "s"}
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onResetCart}
							disabled={
								cartCount === 0 && !selectedCustomerId && !selectedCampaignId
							}
							icon={<Trash className="size-4" weight="duotone" />}
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
									Cart is empty. Add products or services from the catalog.
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
											onClick={() => onRemoveProduct(line.id)}
											icon={<X className="size-4" weight="duotone" />}
										/>
									</div>
									<div className="flex items-center justify-between gap-3">
										<div className="flex items-center gap-2">
											<Button
												type="button"
												variant="outline"
												size="icon-xs"
												onClick={() =>
													onUpdateProductQty(
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
													onUpdateProductQty(
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
											onClick={() => onRemoveService(line.line_id)}
											icon={<X className="size-4" weight="duotone" />}
										/>
									</div>
									<div className="grid gap-3 sm:grid-cols-3">
										<Field>
											<FieldLabel htmlFor={`service-color-${line.line_id}`}>
												Color
											</FieldLabel>
											<Input
												id={`service-color-${line.line_id}`}
												value={line.color}
												onChange={(event) =>
													onUpdateServiceColor(line.line_id, event.target.value)
												}
												placeholder="e.g. Black"
											/>
										</Field>
										<Field
											data-invalid={
												!!form.formState.errors.serviceCart?.[index]?.shoe_brand
											}
										>
											<FieldLabel htmlFor={`service-brand-${line.line_id}`}>
												Item Brand
											</FieldLabel>
											<Input
												id={`service-brand-${line.line_id}`}
												value={line.shoe_brand}
												onChange={(event) =>
													onUpdateServiceBrand(line.line_id, event.target.value)
												}
												placeholder="e.g. Nike"
											/>
											<FieldError
												errors={[
													form.formState.errors.serviceCart?.[index]
														?.shoe_brand,
												]}
											/>
										</Field>
										<Field
											data-invalid={
												!!form.formState.errors.serviceCart?.[index]?.shoe_size
											}
										>
											<FieldLabel htmlFor={`service-size-${line.line_id}`}>
												Item Size
											</FieldLabel>
											<Input
												id={`service-size-${line.line_id}`}
												value={line.shoe_size}
												onChange={(event) =>
													onUpdateServiceSize(line.line_id, event.target.value)
												}
												placeholder="e.g. 42"
											/>
											<FieldError
												errors={[
													form.formState.errors.serviceCart?.[index]?.shoe_size,
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
										<Storefront
											className="size-4 text-muted-foreground"
											weight="duotone"
										/>
										<span className="text-muted-foreground">Store</span>
									</div>
									<span className="font-medium">
										{selectedStore?.name ?? "-"}
									</span>
								</div>
								<div className="flex items-center justify-between gap-3 text-sm">
									<div className="flex items-center gap-2">
										<Receipt
											className="size-4 text-muted-foreground"
											weight="duotone"
										/>
										<span className="text-muted-foreground">Subtotal</span>
									</div>
									<span className="font-medium">
										{formatIDRCurrency(String(subtotal))}
									</span>
								</div>
								<div className="flex items-center justify-between gap-3 text-sm">
									<span className="text-muted-foreground">
										Campaign Discount
									</span>
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

							<div className="grid gap-2 sm:grid-cols-3">
								{orderMeta.map((item) => (
									<OrderMetaBadge
										key={item.label}
										label={item.label}
										value={item.value}
										variant={item.variant}
									/>
								))}
							</div>

							{submitError ? <FieldError>{submitError}</FieldError> : null}

							<Button
								type="button"
								size="lg"
								onClick={() => setPaymentSheetOpen(true)}
								disabled={cartCount === 0}
								icon={<CreditCard className="size-4" weight="duotone" />}
							>
								Review Checkout
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			<Sheet open={paymentSheetOpen} onOpenChange={setPaymentSheetOpen}>
				<SheetContent className="w-full sm:max-w-xl">
					<SheetHeader className="border-b border-border/70">
						<SheetTitle>Payment & Customer</SheetTitle>
						<SheetDescription>
							Finalize customer, campaign, payment, and notes after the order
							lines are correct.
						</SheetDescription>
					</SheetHeader>

					<div className="grid gap-5 overflow-y-auto p-4">
						<Controller
							name="selectedCampaignId"
							control={form.control}
							render={({ field, fieldState }) => (
								<Field data-invalid={fieldState.invalid}>
									<FieldLabel htmlFor="transaction-campaign">
										Campaign
									</FieldLabel>
									<Combobox
										id="transaction-campaign"
										triggerClassName="h-10 w-full text-sm"
										options={campaignOptions}
										value={field.value || "none"}
										onValueChange={(value) =>
											field.onChange(value === "none" ? "" : value)
										}
										loading={campaignsLoading}
										placeholder={
											selectedStoreNumber
												? "No campaign"
												: "Select store first to unlock campaigns"
										}
										searchPlaceholder="Search campaign..."
										emptyText={
											selectedStoreNumber
												? "No campaign found"
												: "Select store first"
										}
										disabled={selectedStoreNumber === undefined}
									/>
									<FieldError errors={[fieldState.error]} />
								</Field>
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
										loading={paymentMethodsLoading}
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

						{selectedCampaign ? (
							<div className="flex items-center justify-between gap-3 border border-emerald-300/60 bg-emerald-50/70 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
								<div>
									<p className="font-medium">{selectedCampaign.name}</p>
									<p className="text-xs text-muted-foreground">
										{selectedCampaign.code} active on this store
									</p>
								</div>
								<Badge variant="success">
									{selectedCampaign.discount_type === "percentage"
										? `${selectedCampaign.discount_value}%`
										: formatIDRCurrency(
												String(selectedCampaign.discount_value),
											)}
								</Badge>
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
										placeholder="Add cashier notes or customer preferences"
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
							onClick={onSubmit}
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
