import { campaignIneligibilityReason } from "@fresclean/api/schema";
import {
	CameraIcon,
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
import { SelectField } from "@/components/form/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CampaignAutocomplete } from "@/features/orders/components/campaign-autocomplete";
import { CustomerAutocomplete } from "@/features/orders/components/customer-autocomplete";
import { SinglePhotoCaptureDialog } from "@/features/orders/components/photo-upload-dialog";
import {
	getCartPricing,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { CampaignSummaryCard } from "@/features/transactions/components/campaign-summary-card";
import { getEntityCategoryName } from "@/features/transactions/lib/transactions";
import { useTransactionsPageContext } from "@/features/transactions/lib/transactions-context";
import {
	campaignsQueryOptions,
	categoriesQueryOptions,
	paymentMethodsQueryOptions,
	usersPageQueryOptions,
} from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";
import { useTransactionsPageStore } from "@/stores/transactions-store";

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
			<p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
				{label}
			</p>
			<div className="mt-1 flex items-center gap-2">
				<Badge variant={variant}>{value}</Badge>
			</div>
		</div>
	);
}

export function TransactionsCheckout() {
	const { visibleStores, submit } = useTransactionsPageContext();
	const {
		resetCart,
		removeProduct,
		removeService,
		updateProductQty,
		updateServiceField,
		productRows,
		serviceRows,
		subtotal,
		count,
	} = useCart();
	const submitError = useTransactionsPageStore((state) => state.submitError);
	const dropoffPhoto = useTransactionsPageStore((state) => state.dropoffPhoto);

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

	const selectedStoreNumber =
		selectedStoreId && Number.isFinite(Number(selectedStoreId))
			? Number(selectedStoreId)
			: undefined;

	const categoriesQuery = useQuery(categoriesQueryOptions());
	const paymentMethodsQuery = useQuery(paymentMethodsQueryOptions());
	const couriersQuery = useQuery(
		usersPageQueryOptions({ role: "courier", is_active: true }),
	);
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
		if (selectedStoreNumber === undefined) {
			return [];
		}
		const now = new Date();
		return (campaignsQuery.data ?? []).filter(
			(campaign) =>
				campaignIneligibilityReason(campaign, {
					now,
					grossTotal: subtotal,
					storeId: selectedStoreNumber,
				}) === null,
		);
	}, [campaignsQuery.data, selectedStoreNumber, subtotal]);

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

	const courierOptions = useMemo<ComboboxOption[]>(
		() => [
			{ value: "none", label: "Walk-in (no courier)" },
			...(couriersQuery.data?.items ?? []).map((courier) => ({
				value: String(courier.id),
				label: courier.name,
			})),
		],
		[couriersQuery.data],
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

	const serviceLines = useMemo(
		() =>
			serviceRows.map((row) => ({
				price: Number(row.service.price),
				service_id: row.service.id,
			})),
		[serviceRows],
	);
	const pricing = useMemo(
		() =>
			getCartPricing({
				subtotal,
				campaigns: selectedCampaigns,
				serviceLines,
				manualDiscount,
			}),
		[subtotal, selectedCampaigns, serviceLines, manualDiscount],
	);

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

	const paymentFields = (
		<>
			<Controller
				name="selectedCampaignIds"
				control={form.control}
				render={({ field, fieldState }) => (
					<CampaignAutocomplete
						id="transaction-campaign"
						label="Campaigns"
						storeId={selectedStoreId}
						grossTotal={subtotal}
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
							triggerClassName="h-11 w-full text-sm"
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
								className="h-11"
								onClick={() => field.onChange("unpaid")}
							>
								Unpaid
							</Button>
							<Button
								type="button"
								variant={field.value === "paid" ? "default" : "outline"}
								className="h-11"
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
						<CampaignSummaryCard key={campaign.id} campaign={campaign} />
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
				name="selectedCourierId"
				control={form.control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="transaction-courier">
							Collected by courier
						</FieldLabel>
						<SelectField
							id="transaction-courier"
							items={courierOptions}
							value={field.value || "none"}
							onValueChange={(value) =>
								field.onChange(value === "none" ? "" : value)
							}
							placeholder="Walk-in (no courier)"
							className="h-11 w-full text-sm"
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
		</>
	);

	return (
		<div className="grid gap-5">
			<Card className="rounded-none border-0 bg-transparent shadow-none">
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
							count === 0 &&
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
					<div className="grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-start">
						<div className="grid gap-3">
							{productRows.length === 0 && serviceRows.length === 0 ? (
								<div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
									Cart is empty.
								</div>
							) : null}

							{productRows.map((line) => (
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
											className="size-11"
											onClick={() => removeProduct(line.id)}
											icon={<XIcon className="size-4" />}
										/>
									</div>
									<div className="flex items-center justify-between gap-3">
										<div className="flex items-center gap-2">
											<Button
												type="button"
												variant="outline"
												size="icon-xs"
												className="size-11"
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
												className="size-11"
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

							{serviceRows.map((line, index) => (
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
											className="size-11"
											onClick={() => removeService(line.line_id)}
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

						<div className="grid gap-4 border-t border-border/70 pt-4 md:sticky md:top-0 md:self-start md:border-t-0 md:pt-0">
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
								{pricing.campaignBreakdown.map(({ campaign, amount }) => (
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
										-{formatIDRCurrency(String(pricing.manualDiscount))}
									</span>
								</div>
								<div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-base font-semibold">
									<span>Total Payment</span>
									<span>
										{formatIDRCurrency(String(Math.round(pricing.total)))}
									</span>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-2">
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

							<div className="grid gap-5 border-t border-border/70 pt-4">
								{paymentFields}
							</div>

							<CheckoutDropoffPhotoField />

							{submitError ? <FieldError>{submitError}</FieldError> : null}

							<Button
								type="button"
								size="lg"
								className="h-11"
								onClick={submit}
								loading={isSubmitting}
								loadingText="Creating order..."
								disabled={count === 0 || !dropoffPhoto}
								aria-describedby={
									count > 0 && !dropoffPhoto ? "create-order-hint" : undefined
								}
								icon={<CreditCardIcon className="size-4" />}
							>
								Create Order
							</Button>
							{count > 0 && !dropoffPhoto ? (
								<p
									className="text-muted-foreground text-xs"
									id="create-order-hint"
								>
									Add a drop-off photo to create the order.
								</p>
							) : null}
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function CheckoutDropoffPhotoField() {
	const dropoffPhoto = useTransactionsPageStore((state) => state.dropoffPhoto);
	const setDropoffPhoto = useTransactionsPageStore(
		(state) => state.setDropoffPhoto,
	);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!dropoffPhoto) {
			setPreviewUrl(null);
			return;
		}
		const url = URL.createObjectURL(dropoffPhoto);
		setPreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [dropoffPhoto]);

	return (
		<Field>
			<FieldLabel>
				Drop-off photo <span className="text-muted-foreground">(required)</span>
			</FieldLabel>
			<div className="aspect-4/3 w-full overflow-hidden border bg-muted sm:aspect-16/10">
				{previewUrl ? (
					<img
						src={previewUrl}
						alt="Drop-off preview"
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
						<CameraIcon className="size-8 opacity-50" />
						<p className="text-sm">Photo of the items at intake</p>
					</div>
				)}
			</div>
			<Button
				type="button"
				variant="outline"
				className="w-full"
				icon={<CameraIcon className="size-4" />}
				onClick={() => setIsDialogOpen(true)}
			>
				{dropoffPhoto ? "Replace photo" : "Add photo"}
			</Button>
			<SinglePhotoCaptureDialog
				open={isDialogOpen}
				onOpenChange={setIsDialogOpen}
				title="Drop-off photo"
				badgeLabel="Drop-off"
				onCapture={setDropoffPhoto}
			/>
		</Field>
	);
}
