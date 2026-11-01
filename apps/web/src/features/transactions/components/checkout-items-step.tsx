import {
	Add01Icon,
	Alert02Icon,
	ArrowLeftRightIcon,
	Camera01Icon,
	CheckmarkCircle02Icon,
	ShoppingCart01Icon,
	ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { EmptyState } from "@/components/empty-state";
import { CurrencyInput } from "@/components/form/currency-input";
import { Badge } from "@/components/ui/badge";
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
import { categoriesQueries } from "@/features/categories/api";
import { PhotoLightbox } from "@/features/orders/components/photo-lightbox";
import { SinglePhotoCaptureDialog } from "@/features/orders/components/photo-upload-dialog";
import {
	getServiceLinePrice,
	type ItemCartDisplayLine,
	isUnpricedServiceLine,
	type ServiceCartDisplayLine,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart, useCartOps } from "@/features/transactions/cart/useCart";
import { RemoveLineButton } from "@/features/transactions/components/remove-line-button";
import { getEntityCategoryName } from "@/features/transactions/lib/transactions";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { cn } from "@/lib/utils";
import { formatMoney, parseMoney } from "@/shared/money";
import { useTransactionsPageStore } from "@/stores/transactions-store";

interface ItemFieldSpec {
	key: "brand" | "color" | "model" | "size";
	label: string;
	placeholder: string;
}

// Typed once per Item however many Services it gets (ADR-0017), in the order
// every other screen and the Receipt show them.
const ITEM_FIELDS: ItemFieldSpec[] = [
	{ key: "brand", label: "Brand", placeholder: "e.g. Adidas" },
	{ key: "model", label: "Model", placeholder: "e.g. Yeezy" },
	{ key: "color", label: "Color", placeholder: "e.g. Black" },
	{ key: "size", label: "Size", placeholder: "e.g. 42" },
];

export const CheckoutItemsStep = () => {
	const { removeProduct, updateProductQty, productRows, itemRows, addItem } =
		useCart();
	const form = useFormContext<TransactionDraftValues>();
	const categoriesQuery = useQuery(categoriesQueries.list());
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
					<EmptyState icon={ShoppingCart01Icon}>Cart is empty.</EmptyState>
				) : null}

				{productRows.map((line) => (
					<div
						className="grid gap-3 rounded-md border border-border/70 p-3"
						key={`product-${line.id}`}
					>
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="text-body font-medium">{line.product.name}</p>
								<p className="text-footnote text-muted-foreground">
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
								<div className="min-w-10 text-center text-body font-medium">
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
							<p className="text-body font-semibold">
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
					<Button onClick={addItem} type="button" variant="outline">
						+ New item
					</Button>
				) : null}
			</div>

			<Controller
				control={form.control}
				name="notes"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="transaction-notes">Order note</FieldLabel>
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
	const isUnpriced = isUnpricedServiceLine(line);

	return (
		<div className="grid gap-2 border-border/70 border-t p-3">
			<div className="flex items-start gap-3">
				{/* Wraps rather than truncates: on a phone, truncating cut every
				    Service name down to "Deep Clea…". */}
				<span className="min-w-0 flex-1 text-body">{line.service.name}</span>
				<span className="flex shrink-0 items-center gap-2">
					{isUnpriced ? <Badge variant="warning">No price yet</Badge> : null}
					<span className="text-body font-semibold tabular-nums">
						{formatMoney(getServiceLinePrice(line))}
					</span>
					{/* For a tap that landed on the wrong shoe: moves the line with its
					    notes and agreed price, so nothing is retyped. */}
					{canMove ? (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										aria-label={`Move ${line.service.name} to another item`}
										className="relative size-7 before:absolute before:-inset-2 before:content-['']"
										icon={
											<HugeiconsIcon
												icon={ArrowLeftRightIcon}
												className="size-3.5"
											/>
										}
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
										<span className="tabular-nums">{itemNumber}</span>
										<span className="max-w-40 truncate">
											{getOrderServiceItemDetails(item) ?? "New item"}
										</span>
									</DropdownMenuItem>
								))}
								{/* A verb, because a blank card above is already labelled
								    "New item" and two entries can't share one label. */}
								<DropdownMenuItem
									onClick={() => moveService(itemId, line.line_id, null)}
								>
									<HugeiconsIcon icon={Add01Icon} className="size-4" />
									Split to a New Item
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
					Note for the worker
				</FieldLabel>
				<Input
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
							? "No price yet. Price it after inspection, then collect payment."
							: "Agreed price. Edit it until the Order is paid."}
					</FieldDescription>
				</Field>
			) : null}
		</div>
	);
};

interface CheckoutItemCardProps {
	// Passed down, since a useCart() per card would rework the whole Cart on
	// every keystroke in a notes field.
	allItems: ItemCartDisplayLine[];
	item: ItemCartDisplayLine;
	itemNumber: number;
}

// One Item and its Services (ADR-0017). Which card the next catalog tap lands
// on is chosen in the tray, where the catalog is.
const CheckoutItemCard = ({
	allItems,
	item,
	itemNumber,
}: CheckoutItemCardProps) => {
	const { removeItem, updateItemField } = useCartOps();
	const descriptors = getOrderServiceItemDetails(item);
	// Numbered by Cart position so the menu matches the cards on screen. A lone
	// Service on the only card has nowhere to go, so it gets no Move.
	const moveTargets: MoveTarget[] = allItems
		.map((other, index) => ({ item: other, itemNumber: index + 1 }))
		.filter((target) => target.item.line_id !== item.line_id);
	const canMove = moveTargets.length > 0 || item.services.length > 1;

	return (
		<article className="overflow-hidden rounded-md border border-border/70">
			<header className="flex items-center gap-3 px-3 pt-2">
				<h3 className="min-w-0 flex-1 truncate font-medium text-body">
					{descriptors ?? "New item"}
				</h3>
				{/* Words, not the ✕: that one drops a single Service, and the two
				    looked the same while this one drops everything on the Item. */}
				<Button
					aria-label={`Remove item ${itemNumber}`}
					className="h-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
					onClick={() => removeItem(item.line_id)}
					size="sm"
					type="button"
					variant="ghost"
				>
					Remove Item
				</Button>
			</header>

			<div className="grid gap-3 p-3 sm:grid-cols-2">
				{ITEM_FIELDS.map((field) => (
					<Field key={field.key}>
						<FieldLabel htmlFor={`item-${field.key}-${item.line_id}`}>
							{field.label}
						</FieldLabel>
						<Input
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

			<section aria-label={`Services on Item ${itemNumber}`}>
				{item.services.length === 0 ? (
					<p className="border-border/70 border-t px-3 py-2.5 text-muted-foreground text-footnote">
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
			// After Reset, a lightbox left open would pop up again over the next
			// Customer's drop-off photo.
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
			{/* Colour carries the state (amber missing, green taken), so no label. */}
			<div
				className={cn(
					"flex items-center justify-between gap-3 rounded-md border p-3 text-body",
					hasPhoto
						? "border-success/40 bg-tone-good"
						: "border-warning/40 bg-tone-warn",
				)}
			>
				<div className="flex items-center gap-2">
					{hasPhoto ? (
						<HugeiconsIcon
							icon={CheckmarkCircle02Icon}
							aria-hidden="true"
							className="size-5 shrink-0 text-tone-good-foreground"
						/>
					) : (
						<HugeiconsIcon
							icon={Alert02Icon}
							aria-hidden="true"
							className="size-5 shrink-0 text-tone-warn-foreground"
						/>
					)}
					<div>
						<p className="font-medium">Drop-off photo</p>
						<p className="text-footnote text-muted-foreground">
							{hasPhoto ? "Captured" : "Required · capture items at intake"}
						</p>
					</div>
				</div>

				{hasPhoto ? (
					<div className="flex items-center gap-2">
						<Button
							className="shrink-0"
							icon={<HugeiconsIcon icon={ViewIcon} className="size-4" />}
							onClick={() => setIsLightboxOpen(true)}
							type="button"
							variant="outline"
						>
							Preview Photo
						</Button>
						<Button
							className="shrink-0"
							icon={<HugeiconsIcon icon={Camera01Icon} className="size-4" />}
							onClick={() => setIsDialogOpen(true)}
							type="button"
							variant="outline"
						>
							Retake
						</Button>
					</div>
				) : (
					<Button
						className="shrink-0"
						icon={<HugeiconsIcon icon={Camera01Icon} className="size-4" />}
						onClick={() => setIsDialogOpen(true)}
						type="button"
						variant="outline"
					>
						Take Photo
					</Button>
				)}
			</div>

			<SinglePhotoCaptureDialog
				badgeLabel="Drop-off"
				onCapture={setDropoffPhoto}
				onOpenChange={setIsDialogOpen}
				open={isDialogOpen}
				title="Drop-Off Photo"
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
					title="Drop-Off Photo"
				/>
			) : null}
		</>
	);
};
