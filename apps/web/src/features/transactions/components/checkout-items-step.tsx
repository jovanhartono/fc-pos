import {
	ArrowsLeftRightIcon,
	CameraIcon,
	CheckCircleIcon,
	EyeIcon,
	PlusIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { CurrencyInput } from "@/components/form/currency-input";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
	type ItemCartDisplayLine,
	type ServiceCartDisplayLine,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart, useCartOps } from "@/features/transactions/cart/useCart";
import { RemoveLineButton } from "@/features/transactions/components/remove-line-button";
import { getEntityCategoryName } from "@/features/transactions/lib/transactions";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { categoriesQueryOptions } from "@/lib/query-options";
import { cn } from "@/lib/utils";
import { formatMoney, parseMoney } from "@/shared/money";
import { useTransactionsPageStore } from "@/stores/transactions-store";

interface ItemFieldSpec {
	key: "brand" | "color" | "model" | "size";
	label: string;
	placeholder: string;
}

// Free-text descriptors the cashier reads off the object at the counter. They
// describe one physical thing, so they are typed once per Item however many
// treatments get sold against it (ADR-0017).
// Same order as getOrderServiceItemDescriptors reads them back — brand, model,
// colour, size. The cashier types the tag in the order every other screen and
// the printed receipt will show it.
const ITEM_FIELDS: ItemFieldSpec[] = [
	{ key: "brand", label: "Brand", placeholder: "e.g. Adidas" },
	{ key: "model", label: "Model", placeholder: "e.g. Yeezy" },
	{ key: "color", label: "Color", placeholder: "e.g. Black" },
	{ key: "size", label: "Size", placeholder: "e.g. 42" },
];

// Step ② — the goods: review/annotate cart lines, order notes, and the
// drop-off photo. The photo lives here (with the items it depicts, captured at
// intake — see CONTEXT.md) and gates the step forward (see CheckoutFooter).
export const CheckoutItemsStep = () => {
	const { removeProduct, updateProductQty, productRows, itemRows, addItem } =
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
				{productRows.length === 0 && itemRows.length === 0 ? (
					<div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
						Cart is empty.
					</div>
				) : null}

				{productRows.map((line) => (
					<div
						className="grid gap-3 border border-border/70 p-3"
						key={`product-${line.id}`}
					>
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="text-sm font-medium">{line.product.name}</p>
								<p className="text-xs text-muted-foreground">
									Product | {getEntityCategoryName(line.product, categoryMap)}
								</p>
							</div>
							<RemoveLineButton
								label={`Remove ${line.product.name}`}
								onClick={() => removeProduct(line.id)}
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

				{itemRows.map((item, index) => (
					<CheckoutItemCard
						allItems={itemRows}
						item={item}
						itemNumber={index + 1}
						key={item.line_id}
					/>
				))}

				{itemRows.length > 0 ? (
					<Button
						className="h-11"
						onClick={addItem}
						type="button"
						variant="outline"
					>
						+ New item
					</Button>
				) : null}
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

interface MoveTarget {
	item: ItemCartDisplayLine;
	itemNumber: number;
}

interface CheckoutTreatmentRowProps {
	canMove: boolean;
	itemId: string;
	line: ServiceCartDisplayLine;
	moveTargets: MoveTarget[];
}

const CheckoutTreatmentRow = ({
	canMove,
	itemId,
	line,
	moveTargets,
}: CheckoutTreatmentRowProps) => {
	const { removeService, updateServiceField, moveService } = useCartOps();
	const isUnpriced =
		line.service.price === null && getServiceLinePrice(line) <= 0;

	return (
		<div className="grid gap-2 border-border/70 border-t p-3 first-of-type:border-t-0">
			<div className="flex items-start gap-3">
				{/* Wraps rather than truncates: service names run to 30+ characters
				    and the price column leaves this one ~130px on a phone, so
				    truncating cut every line down to "Deep Clea…". */}
				<span className="min-w-0 flex-1 text-sm">{line.service.name}</span>
				<span className="flex shrink-0 items-center gap-2">
					{isUnpriced ? (
						<span className="border border-warning/50 bg-warning/10 px-1.5 font-mono text-[10px] text-warning">
							No price yet
						</span>
					) : null}
					<span className="font-mono text-sm font-semibold tabular-nums">
						{formatMoney(getServiceLinePrice(line))}
					</span>
					{/* The recovery for a tap that landed on the wrong shoe: carry the
					    line — notes and negotiated price included — instead of delete,
					    re-add, retype. */}
					{canMove ? (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										aria-label={`Move ${line.service.name} to another item`}
										className="relative size-7 before:absolute before:-inset-2 before:content-['']"
										icon={<ArrowsLeftRightIcon className="size-3.5" />}
										size="icon-xs"
										type="button"
										variant="outline"
									/>
								}
							/>
							<DropdownMenuContent align="end">
								{moveTargets.map(({ item, itemNumber }) => (
									<DropdownMenuItem
										key={item.line_id}
										onClick={() =>
											moveService(itemId, line.line_id, item.line_id)
										}
									>
										<span className="font-mono tabular-nums">{itemNumber}</span>
										<span className="max-w-40 truncate">
											{getOrderServiceItemDetails(item) ?? "New item"}
										</span>
									</DropdownMenuItem>
								))}
								{/* A verb, because a card without descriptors is labelled
								    "New item" above it, and two entries with one label and
								    two outcomes is a menu nobody can read. */}
								<DropdownMenuItem
									onClick={() => moveService(itemId, line.line_id, null)}
								>
									<PlusIcon className="size-4" />
									Split to a new item
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
					<RemoveLineButton
						label={`Remove ${line.service.name}`}
						onClick={() => removeService(itemId, line.line_id)}
					/>
				</span>
			</div>

			<Field>
				<FieldLabel htmlFor={`service-notes-${line.line_id}`}>
					Service notes
				</FieldLabel>
				<Input
					className="h-11"
					id={`service-notes-${line.line_id}`}
					onChange={(event) =>
						updateServiceField(
							itemId,
							line.line_id,
							"notes",
							event.target.value,
						)
					}
					placeholder="e.g. No bleach"
					value={line.notes}
				/>
			</Field>

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
							updateServiceField(itemId, line.line_id, "price", value)
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
	);
};

interface CheckoutItemCardProps {
	// Every card on the counter, from the step that already derived them. A
	// useCart() down here would re-derive the whole cart once per card on every
	// keystroke in a notes field.
	allItems: ItemCartDisplayLine[];
	item: ItemCartDisplayLine;
	itemNumber: number;
}

// One physical object and everything sold against it (ADR-0017). Three bands:
// a shaded header naming the object, its descriptors, then the treatments inset
// under a rail — so the eye reads parent and children rather than one flat run
// of hairlines. Which card the next catalog tap lands on is chosen in the tray,
// where the catalog is; this sheet has nothing to point at.
const CheckoutItemCard = ({
	allItems,
	item,
	itemNumber,
}: CheckoutItemCardProps) => {
	const { removeItem, updateItemField } = useCartOps();
	const descriptors = getOrderServiceItemDetails(item);
	// Where a treatment on this card could go instead, numbered by cart position
	// so the menu matches the card numbers on screen. Moving is only meaningful
	// when there is somewhere to go: another card, or off a card holding more
	// than the one line — a lone treatment on the only card would just be
	// renumbering itself.
	const moveTargets: MoveTarget[] = allItems
		.map((other, index) => ({ item: other, itemNumber: index + 1 }))
		.filter((target) => target.item.line_id !== item.line_id);
	const canMove = moveTargets.length > 0 || item.services.length > 1;

	return (
		<article className="border border-border/70">
			<header className="flex items-center gap-3 bg-muted/40 px-3 py-2">
				<div className="grid min-w-0 flex-1 gap-0.5">
					<p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
						Item {itemNumber}
					</p>
					<h3 className="truncate font-medium text-sm">
						{descriptors ?? "New item"}
					</h3>
				</div>
				<RemoveLineButton
					label={`Remove item ${itemNumber}`}
					onClick={() => removeItem(item.line_id)}
				/>
			</header>

			<div className="grid gap-3 p-3 sm:grid-cols-2">
				{ITEM_FIELDS.map((field) => (
					<Field key={field.key}>
						<FieldLabel htmlFor={`item-${field.key}-${item.line_id}`}>
							{field.label}
						</FieldLabel>
						<Input
							className="h-11"
							id={`item-${field.key}-${item.line_id}`}
							onChange={(event) =>
								updateItemField(item.line_id, field.key, event.target.value)
							}
							placeholder={field.placeholder}
							value={item[field.key]}
						/>
					</Field>
				))}
			</div>

			<section
				aria-label={`Treatments on item ${itemNumber}`}
				className="mx-3 mb-3 border border-border/70 border-l-2 border-l-foreground/40"
			>
				<p className="px-3 pt-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
					Treatments · {item.services.length}
				</p>
				{item.services.length === 0 ? (
					<p className="px-3 pt-1 pb-2.5 text-muted-foreground text-xs">
						Tap a service to add it here
					</p>
				) : null}
				{item.services.map((line) => (
					<CheckoutTreatmentRow
						canMove={canMove}
						itemId={item.line_id}
						key={line.line_id}
						line={line}
						moveTargets={moveTargets}
					/>
				))}
			</section>
		</article>
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
