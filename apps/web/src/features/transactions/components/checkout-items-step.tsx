import {
	CameraIcon,
	CheckCircleIcon,
	CheckIcon,
	EyeIcon,
	WarningIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { CurrencyInput } from "@/components/form/currency-input";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhotoLightbox } from "@/features/orders/components/photo-lightbox";
import { SinglePhotoCaptureDialog } from "@/features/orders/components/photo-upload-dialog";
import {
	getServiceLinePrice,
	type ServiceCartDisplayLine,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { getEntityCategoryName } from "@/features/transactions/lib/transactions";
import { categoriesQueryOptions } from "@/lib/query-options";
import { cn } from "@/lib/utils";
import { formatMoney, parseMoney } from "@/shared/money";
import { useTransactionsPageStore } from "@/stores/transactions-store";

interface ServiceFieldSpec {
	key: "brand" | "color" | "model" | "size" | "notes";
	label: string;
	placeholder: string;
	className?: string;
}

// Free-text descriptors the cashier reads off the item at the counter.
const SERVICE_FIELDS: ServiceFieldSpec[] = [
	{ key: "color", label: "Color", placeholder: "e.g. Black" },
	{ key: "brand", label: "Brand", placeholder: "e.g. Adidas" },
	{ key: "model", label: "Model", placeholder: "e.g. Yeezy" },
	{ key: "size", label: "Size", placeholder: "e.g. 42" },
	{
		key: "notes",
		label: "Item notes",
		placeholder: "e.g. Loose sole, no bleach",
		className: "sm:col-span-2",
	},
];

// Step ② — the goods: review/annotate cart lines, order notes, and the
// drop-off photo. The photo lives here (with the items it depicts, captured at
// intake — see CONTEXT.md) and gates the step forward (see CheckoutFooter).
export const CheckoutItemsStep = () => {
	const {
		removeProduct,
		removeService,
		updateProductQty,
		updateServiceField,
		updateServicePricing,
		productRows,
		serviceRows,
	} = useCart();
	const form = useFormContext<TransactionDraftValues>();
	const categoriesQuery = useQuery(categoriesQueryOptions());
	const categoryMap = useMemo(
		() =>
			new Map(
				(categoriesQuery.data ?? []).map((category) => [category.id, category]),
			),
		[categoriesQuery.data],
	);

	return (
		<div className="grid gap-5">
			<div className="grid gap-3">
				{productRows.length === 0 && serviceRows.length === 0 ? (
					<div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
						Cart is empty.
					</div>
				) : null}

				{productRows.map((line) => (
					<div
						className="grid gap-3 border border-border/70 p-3"
						key={`product-${line.id}`}
					>
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-sm font-medium">{line.product.name}</p>
								<p className="text-xs text-muted-foreground">
									Product | {getEntityCategoryName(line.product, categoryMap)}
								</p>
							</div>
							<Button
								aria-label={`Remove ${line.product.name}`}
								className="size-11"
								icon={<XIcon className="size-4" />}
								onClick={() => removeProduct(line.id)}
								size="icon-xs"
								type="button"
								variant="outline"
							/>
						</div>
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<Button
									aria-label="Decrease quantity"
									className="size-11"
									onClick={() =>
										updateProductQty(
											line.id,
											line.qty - 1,
											Number(line.product.stock ?? line.qty),
										)
									}
									size="icon-xs"
									type="button"
									variant="outline"
								>
									-
								</Button>
								<div className="min-w-10 text-center text-sm font-medium">
									{line.qty}
								</div>
								<Button
									aria-label="Increase quantity"
									className="size-11"
									disabled={line.qty >= Number(line.product.stock ?? line.qty)}
									onClick={() =>
										updateProductQty(
											line.id,
											line.qty + 1,
											Number(line.product.stock ?? line.qty),
										)
									}
									size="icon-xs"
									type="button"
									variant="outline"
								>
									+
								</Button>
							</div>
							<p className="text-sm font-semibold">
								{formatMoney(parseMoney(line.product.price) * line.qty)}
							</p>
						</div>
					</div>
				))}

				{serviceRows.map((line) => (
					<div
						className="grid gap-3 border border-border/70 p-3"
						key={line.line_id}
					>
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-sm font-medium">{line.service.name}</p>
								<p className="text-xs text-muted-foreground">
									Service | {getEntityCategoryName(line.service, categoryMap)}
								</p>
							</div>
							<Button
								aria-label={`Remove ${line.service.name}`}
								className="size-11"
								icon={<XIcon className="size-4" />}
								onClick={() => removeService(line.line_id)}
								size="icon-xs"
								type="button"
								variant="outline"
							/>
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							{SERVICE_FIELDS.map((field) => (
								<Field className={field.className} key={field.key}>
									<FieldLabel htmlFor={`service-${field.key}-${line.line_id}`}>
										{field.label}
									</FieldLabel>
									<Input
										className="h-11"
										id={`service-${field.key}-${line.line_id}`}
										onChange={(event) =>
											updateServiceField(
												line.line_id,
												field.key,
												event.target.value,
											)
										}
										placeholder={field.placeholder}
										value={line[field.key]}
									/>
								</Field>
							))}
						</div>
						{line.service.price === null ? (
							<ServiceLinePricing line={line} onPatch={updateServicePricing} />
						) : null}
						<div className="flex items-center justify-end gap-3">
							<p className="text-sm font-semibold">
								{formatMoney(getServiceLinePrice(line))}
							</p>
						</div>
					</div>
				))}
			</div>

			<Controller
				control={form.control}
				name="notes"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="transaction-notes">Notes</FieldLabel>
						<Textarea
							id="transaction-notes"
							onChange={field.onChange}
							placeholder="Add notes"
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>

			<CheckoutDropoffPhotoField />
		</div>
	);
};

interface ServiceLinePricingProps {
	line: ServiceCartDisplayLine;
	onPatch: (
		lineId: string,
		patch: { price?: string; is_estimate?: boolean },
	) => void;
}

// Pricing entry for a no-list-price Service (ADR-0018): the cashier keys the
// number and declares it firm or an Estimate. Firm behaves like any catalog
// price; an Estimate holds the whole Order unpaid until confirmed.
const ServiceLinePricing = ({ line, onPatch }: ServiceLinePricingProps) => (
	<div className="grid gap-3 border border-border/70 bg-muted/20 p-3">
		<div className="grid gap-3 sm:grid-cols-2">
			<Field>
				<FieldLabel asterisk htmlFor={`service-price-${line.line_id}`}>
					Price
				</FieldLabel>
				<CurrencyInput
					id={`service-price-${line.line_id}`}
					onValueChange={(value) => onPatch(line.line_id, { price: value })}
					required
					value={line.price}
				/>
			</Field>
			<FieldSet className="gap-2">
				<FieldLegend variant="label">Pricing</FieldLegend>
				<div className="grid grid-cols-2 gap-2">
					<PricingModeTile
						hint="Payable now"
						isSelected={!line.is_estimate}
						label="Firm"
						name={`pricing-mode-${line.line_id}`}
						onSelect={() => onPatch(line.line_id, { is_estimate: false })}
					/>
					<PricingModeTile
						hint="Confirm after inspection"
						isSelected={line.is_estimate}
						label="Estimate"
						name={`pricing-mode-${line.line_id}`}
						onSelect={() => onPatch(line.line_id, { is_estimate: true })}
					/>
				</div>
			</FieldSet>
		</div>
		{line.is_estimate ? (
			<p className="text-muted-foreground text-xs">
				Estimate blocks payment until confirmed. Order goes out unpaid.
			</p>
		) : null}
	</div>
);

interface PricingModeTileProps {
	label: string;
	hint: string;
	name: string;
	isSelected: boolean;
	onSelect: () => void;
}

// Real (visually hidden) radio wrapped by the styled tile — same pattern as
// the payment method tiles: native radiogroup semantics, full-tile target.
const PricingModeTile = ({
	label,
	hint,
	name,
	isSelected,
	onSelect,
}: PricingModeTileProps) => (
	<label
		className={cn(
			"flex min-h-11 cursor-pointer items-center justify-between gap-2 border px-3 py-2 text-left transition active:scale-[0.97] has-[:focus-visible]:border-ring has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring/50",
			isSelected
				? "border-foreground bg-foreground text-background"
				: "border-border/70 text-foreground/80 hover:border-border hover:bg-muted/40",
		)}
	>
		<input
			checked={isSelected}
			className="sr-only"
			name={name}
			onChange={onSelect}
			type="radio"
		/>
		<span className="flex flex-col">
			<span className="text-sm font-medium">{label}</span>
			<span
				className={cn(
					"text-[11px]",
					isSelected ? "text-background/70" : "text-muted-foreground",
				)}
			>
				{hint}
			</span>
		</span>
		{isSelected ? (
			<CheckIcon className="size-4 shrink-0" weight="bold" />
		) : null}
	</label>
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
			// Photo was cleared (e.g. Reset) — close the preview too, or the lightbox
			// stays "open" and re-pops the moment the next photo is captured.
			setIsLightboxOpen(false);
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
							aria-hidden="true"
							className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
							weight="fill"
						/>
					) : (
						<WarningIcon
							aria-hidden="true"
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
							className="h-11 shrink-0"
							icon={<EyeIcon className="size-4" />}
							onClick={() => setIsLightboxOpen(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							Preview photo
						</Button>
						<Button
							className="h-11 shrink-0"
							icon={<CameraIcon className="size-4" />}
							onClick={() => setIsDialogOpen(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							Retake
						</Button>
					</div>
				) : (
					<Button
						className="h-11 shrink-0"
						icon={<CameraIcon className="size-4" />}
						onClick={() => setIsDialogOpen(true)}
						size="sm"
						type="button"
						variant="outline"
					>
						Take photo
					</Button>
				)}
			</div>

			<SinglePhotoCaptureDialog
				badgeLabel="Drop-off"
				onCapture={setDropoffPhoto}
				onOpenChange={setIsDialogOpen}
				open={isDialogOpen}
				title="Drop-off photo"
			/>

			{previewUrl ? (
				<PhotoLightbox
					items={[
						{
							id: "dropoff-preview",
							image_url: previewUrl,
							alt: "Drop-off photo",
							created_at: "",
							primaryLabel: "Drop-off photo",
						},
					]}
					onOpenChange={setIsLightboxOpen}
					open={isLightboxOpen}
					title="Drop-off photo"
				/>
			) : null}
		</>
	);
};
