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
import { getOrderServiceItemDescriptors } from "@/lib/order-service-item-details";
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
	const { removeProduct, updateProductQty, productRows, serviceRows } =
		useCart();
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
								className="size-11 border-destructive/50 bg-destructive/10 text-destructive hover:border-destructive hover:bg-destructive/20 hover:text-destructive"
								icon={<XIcon className="size-3.5" />}
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
						itemNumber={index + 1}
						key={line.line_id}
						line={line}
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
}

// Reads the cart itself instead of taking forwarded actions as props — same
// contract as CartLines, so every surface removes and edits lines identically.
const CheckoutServiceLineRow = ({
	line,
	itemNumber,
}: CheckoutServiceLineRowProps) => {
	const { removeService, updateServiceField } = useCart();
	const descriptors = getOrderServiceItemDescriptors(line);
	const isUnpriced =
		line.service.price === null && getServiceLinePrice(line) <= 0;

	return (
		<details className="group border border-border/70">
			<summary className="flex cursor-pointer list-none items-start gap-3 p-3 hover:bg-muted/30 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
				<span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
					{itemNumber}
				</span>
				<span className="grid min-w-0 flex-1 gap-1">
					{/* Wraps rather than truncates: service names run to 30+ characters
						    and the price column leaves this one ~130px on a phone, so
						    truncating cut every line down to "Deep Clea…". */}
					<span className="text-sm font-medium">{line.service.name}</span>
					<span className="flex flex-wrap gap-1">
						{descriptors.length > 0 ? (
							descriptors.map((value, valueIndex) => (
								<span
									className="border border-border/70 px-1.5 font-mono text-[10px] text-muted-foreground"
									key={`${valueIndex}-${value}`}
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
				{/* self-center against the summary, whose height never changes when
					    the disclosure opens — so price, remove and caret sit perfectly
					    centered on the row at any name length or open state. */}
				<span className="flex shrink-0 items-center gap-2 self-center">
					<span className="font-mono text-sm font-semibold tabular-nums">
						{formatMoney(getServiceLinePrice(line))}
					</span>
					<Button
						aria-label={`Remove ${line.service.name}`}
						className="size-11 border-destructive/50 bg-destructive/10 text-destructive hover:border-destructive hover:bg-destructive/20 hover:text-destructive"
						icon={<XIcon className="size-3.5" />}
						// A button inside <summary>: preventDefault stops the click from
						// also toggling the disclosure while the row is being removed.
						onClick={(event) => {
							event.preventDefault();
							removeService(line.line_id);
						}}
						size="icon-xs"
						type="button"
						variant="outline"
					/>
					<CaretDownIcon
						aria-hidden="true"
						className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
					/>
				</span>
			</summary>

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
					// Blank is a valid answer here, not a missing one: a Repair is priced
					// after inspection (ADR-0018).
					<Field>
						<FieldLabel htmlFor={`service-price-${line.line_id}`}>
							Price
						</FieldLabel>
						<CurrencyInput
							id={`service-price-${line.line_id}`}
							onValueChange={(value) =>
								updateServiceField(line.line_id, "price", value)
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
