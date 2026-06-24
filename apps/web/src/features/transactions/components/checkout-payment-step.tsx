import {
	CameraIcon,
	CheckCircleIcon,
	CheckIcon,
	EyeIcon,
	ReceiptIcon,
	StorefrontIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { CurrencyInput } from "@/components/form/currency-input";
import { Button } from "@/components/ui/button";
import type { ComboboxOption } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { CampaignAutocomplete } from "@/features/orders/components/campaign-autocomplete";
import { PhotoLightbox } from "@/features/orders/components/photo-lightbox";
import { SinglePhotoCaptureDialog } from "@/features/orders/components/photo-upload-dialog";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { CampaignSummaryCard } from "@/features/transactions/components/campaign-summary-card";
import { useCheckoutPricing } from "@/features/transactions/hooks/useCheckoutPricing";
import { useTransactionsPageContext } from "@/features/transactions/lib/transactions-context";
import { paymentMethodsQueryOptions } from "@/lib/query-options";
import { cn } from "@/lib/utils";
import { formatIDRCurrency } from "@/shared/utils";
import { useTransactionsPageStore } from "@/stores/transactions-store";

export const CheckoutPaymentStep = () => {
	const { visibleStores } = useTransactionsPageContext();
	const { subtotal, selectedCampaigns, pricing } = useCheckoutPricing();
	const form = useFormContext<TransactionDraftValues>();
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

	return (
		<div className="grid gap-5">
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
				name="selectedPaymentMethodId"
				control={form.control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel>Payment</FieldLabel>
						{/* Method = "how the money arrived". Picking one marks the order
						    paid; "Pay later" (empty) leaves it unpaid. No separate
						    paid/unpaid toggle — the selection carries both. */}
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
							<PaymentMethodTile
								label="Pay later"
								hint="Unpaid"
								isSelected={field.value === ""}
								onSelect={() => field.onChange("")}
							/>
							{paymentMethodOptions.map((option) => (
								<PaymentMethodTile
									key={option.value}
									label={option.label}
									isSelected={field.value === option.value}
									onSelect={() => field.onChange(option.value)}
								/>
							))}
						</div>
						<FieldError errors={[fieldState.error]} />
					</Field>
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
				{pricing.campaignBreakdown.map(({ campaign, amount }) => (
					<div
						key={campaign.id}
						className="flex items-center justify-between gap-3 text-sm"
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

			<CheckoutDropoffPhotoField />
		</div>
	);
};

interface PaymentMethodTileProps {
	label: string;
	hint?: string;
	isSelected: boolean;
	onSelect: () => void;
}

const PaymentMethodTile = ({
	label,
	hint,
	isSelected,
	onSelect,
}: PaymentMethodTileProps) => (
	<button
		type="button"
		aria-pressed={isSelected}
		onClick={onSelect}
		className={cn(
			"flex min-h-12 items-center justify-between gap-2 border px-3 py-2 text-left outline-none transition active:scale-[0.97] focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
			isSelected
				? "border-foreground bg-foreground text-background"
				: "border-border/70 text-foreground/80 hover:border-border hover:bg-muted/40",
		)}
	>
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
	</button>
);

const CheckoutDropoffPhotoField = () => {
	const dropoffPhoto = useTransactionsPageStore((state) => state.dropoffPhoto);
	const setDropoffPhoto = useTransactionsPageStore(
		(state) => state.setDropoffPhoto,
	);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isLightboxOpen, setIsLightboxOpen] = useState(false);
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

	const hasPhoto = !!previewUrl;

	return (
		<>
			{/* Status section, not a preview: amber = required-but-missing,
			    emerald = captured. Color carries the state, so no separate label. */}
			<div
				className={cn(
					"flex items-center justify-between gap-3 border p-3 text-sm",
					hasPhoto
						? "border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30"
						: "border-amber-300/70 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30",
				)}
			>
				<div className="flex items-center gap-2">
					{hasPhoto ? (
						<CheckCircleIcon
							className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
							weight="fill"
						/>
					) : (
						<WarningIcon
							className="size-5 shrink-0 text-amber-600 dark:text-amber-400"
							weight="fill"
						/>
					)}
					<div>
						<p className="font-medium">Drop-off photo</p>
						<p className="text-xs text-muted-foreground">
							{hasPhoto ? "Captured" : "Required · capture items at intake"}
						</p>
					</div>
				</div>

				{hasPhoto ? (
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-9 shrink-0"
							icon={<EyeIcon className="size-4" />}
							onClick={() => setIsLightboxOpen(true)}
						>
							Preview photo
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-9 shrink-0"
							icon={<CameraIcon className="size-4" />}
							onClick={() => setIsDialogOpen(true)}
						>
							Retake
						</Button>
					</div>
				) : (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-9 shrink-0"
						icon={<CameraIcon className="size-4" />}
						onClick={() => setIsDialogOpen(true)}
					>
						Take photo
					</Button>
				)}
			</div>

			<SinglePhotoCaptureDialog
				open={isDialogOpen}
				onOpenChange={setIsDialogOpen}
				title="Drop-off photo"
				badgeLabel="Drop-off"
				onCapture={setDropoffPhoto}
			/>

			{previewUrl ? (
				<PhotoLightbox
					open={isLightboxOpen}
					onOpenChange={setIsLightboxOpen}
					title="Drop-off photo"
					items={[
						{
							id: "dropoff-preview",
							image_url: previewUrl,
							alt: "Drop-off photo",
							created_at: "",
							primaryLabel: "Drop-off photo",
						},
					]}
				/>
			) : null}
		</>
	);
};
