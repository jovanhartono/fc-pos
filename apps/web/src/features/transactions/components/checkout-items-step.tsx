import {
	CameraIcon,
	CaretDownIcon,
	CheckCircleIcon,
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
	FieldDescription,
	FieldError,
	FieldLabel,
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
			{/* Above the items, not below them: this is the control that satisfies
			    Continue's "Add a drop-off photo" gate, and with three items expanded it
			    used to sit ~1000px further down with nothing pointing at it. */}
			<CheckoutDropoffPhotoField />

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

				{serviceRows.map((line, index) => (
					<CheckoutServiceLineRow
						categoryName={getEntityCategoryName(line.service, categoryMap)}
						itemNumber={index + 1}
						key={line.line_id}
						line={line}
						onFieldChange={updateServiceField}
						onRemove={removeService}
					/>
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
		</div>
	);
};

interface CheckoutServiceLineRowProps {
	line: ServiceCartDisplayLine;
	itemNumber: number;
	categoryName: string;
	onRemove: (lineId: string) => void;
	onFieldChange: (
		lineId: string,
		field: ServiceFieldSpec["key"] | "price",
		value: string,
	) => void;
}

// One Item, collapsed to a row. Every descriptor here is optional, so five
// expanded fields per item turned a realistic five-pair intake into 25 empty
// inputs and pushed the photo control off screen. The summary carries what the
// cashier reads back to the customer — the number that tells two identical
// services apart, the descriptors already keyed, and whether the line is still
// unpriced — and the fields open on demand.
const CheckoutServiceLineRow = ({
	line,
	itemNumber,
	categoryName,
	onRemove,
	onFieldChange,
}: CheckoutServiceLineRowProps) => {
	const descriptors = [line.brand, line.color, line.model, line.size]
		.map((value) => value.trim())
		.filter(Boolean);
	// A no-list-price line left blank is normal (ADR-0018), but collapsing the
	// price field would hide that state — so it becomes a chip.
	const isUnpriced =
		line.service.price === null && getServiceLinePrice(line) <= 0;

	return (
		<details className="group relative border border-border/70">
			<summary className="flex cursor-pointer list-none items-start gap-3 p-3 hover:bg-muted/30 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
				<span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
					{itemNumber}
				</span>
				<span className="grid min-w-0 flex-1 gap-1">
					<span className="flex min-w-0 items-baseline gap-1.5">
						<span className="truncate text-sm font-medium">
							{line.service.name}
						</span>
						<span className="shrink-0 text-muted-foreground text-xs">
							{categoryName}
						</span>
					</span>
					<span className="flex flex-wrap gap-1">
						{descriptors.length > 0 ? (
							descriptors.map((value) => (
								<span
									className="border border-border/70 px-1.5 font-mono text-[10px] text-muted-foreground"
									key={value}
								>
									{value}
								</span>
							))
						) : (
							<span className="font-mono text-[10px] text-muted-foreground">
								Add detail
							</span>
						)}
						{isUnpriced ? (
							<span className="border border-warning/50 bg-warning/10 px-1.5 font-mono text-[10px] text-warning">
								No price yet
							</span>
						) : null}
					</span>
				</span>
				<span className="mt-0.5 shrink-0 pr-11 font-mono text-sm font-semibold tabular-nums">
					{formatMoney(getServiceLinePrice(line))}
				</span>
				<CaretDownIcon
					aria-hidden="true"
					className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
				/>
			</summary>

			{/* Outside <summary> so the row keeps one activation target — a button
			    nested in a summary toggles the disclosure on its way through. */}
			<Button
				aria-label={`Remove ${line.service.name}`}
				className="absolute top-2 right-8 size-11"
				icon={<XIcon className="size-4" />}
				onClick={() => onRemove(line.line_id)}
				size="icon-xs"
				type="button"
				variant="outline"
			/>

			<div className="grid gap-3 border-border/70 border-t p-3">
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
									onFieldChange(line.line_id, field.key, event.target.value)
								}
								placeholder={field.placeholder}
								value={line[field.key]}
							/>
						</Field>
					))}
				</div>
				{line.service.price === null ? (
					// No-list-price Service (Repair, ADR-0018): the price is keyed here
					// when the customer already agreed to a number, and left blank when
					// the workshop still has to inspect the item.
					<Field>
						<FieldLabel htmlFor={`service-price-${line.line_id}`}>
							Price
						</FieldLabel>
						<CurrencyInput
							id={`service-price-${line.line_id}`}
							onValueChange={(value) =>
								onFieldChange(line.line_id, "price", value)
							}
							value={line.price}
						/>
						<FieldDescription>
							{line.price.trim() === ""
								? "No price yet — payment waits until this line is priced after inspection."
								: "Agreed price. Can be corrected until the order is paid."}
						</FieldDescription>
					</Field>
				) : null}
			</div>
		</details>
	);
};

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
