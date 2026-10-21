import { Camera01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useState } from "react";
import { TextSkeleton } from "@/components/text-skeleton";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrderDetail } from "@/features/orders/api";
import {
	OrderPhotoGallery,
	type OrderPhotoGalleryItem,
} from "@/features/orders/components/order-photo-gallery";
import { OrderSectionHeader } from "@/features/orders/components/order-section-header";
import {
	PhotoLightbox,
	type PhotoLightboxItem,
} from "@/features/orders/components/photo-lightbox";
import { SinglePhotoUploadDialog } from "@/features/orders/components/photo-upload-dialog";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import { orderDropoffPhotoUploader } from "@/features/orders/utils/photo-upload";

type PickupEvent = OrderDetail["pickup_events"][number];

type DropoffOrder = Pick<
	OrderDetail,
	"id" | "created_at" | "dropoff_photo_url" | "dropoff_photo_uploaded_at"
>;

// Square tiles of one size at every width: two to a row on a phone, more on
// the full page.
const TILE_GRID =
	"grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-3 gap-y-4";

const EMPTY_TILE =
	"flex aspect-square w-full items-center justify-center rounded-md border bg-muted text-muted-foreground";

// A drop-off photo with its time and Replace button, beside the pickup tile.
export const OrderAttachmentsSkeleton = () => (
	<section className="grid gap-3">
		<OrderSectionHeader>Attachments</OrderSectionHeader>
		<Card className="gap-4 p-4 text-body">
			<div className={TILE_GRID}>
				{["Drop-off", "Pickup"].map((label) => (
					<div className="grid content-start gap-1.5" key={label}>
						<AttachmentLabel>{label}</AttachmentLabel>
						<Skeleton className="aspect-square w-full rounded-md" />
						<TileCaption
							line1={
								label === "Drop-off" ? (
									<TextSkeleton className="w-32" />
								) : undefined
							}
							line2={
								<span className="inline-flex h-9 items-center pointer-coarse:h-11">
									<TextSkeleton className="w-28" />
								</span>
							}
						/>
					</div>
				))}
			</div>
		</Card>
	</section>
);

interface OrderAttachmentsCardProps {
	order: DropoffOrder;
	canManageDropoff: boolean;
	onUploaded: () => Promise<void>;
	pickupEvents: PickupEvent[];
}

export const OrderAttachmentsCard = ({
	order,
	canManageDropoff,
	onUploaded,
	pickupEvents,
}: OrderAttachmentsCardProps) => {
	const pickupItems = toPickupItems(pickupEvents);
	// One pickup sits beside the drop-off so the counter compares what came in
	// with what went out; a split collection gets its own row of pickups.
	const hasManyPickups = pickupItems.length > 1;

	return (
		<section className="grid gap-3">
			<OrderSectionHeader>Attachments</OrderSectionHeader>
			<Card className="gap-4 p-4 text-body">
				<div className={TILE_GRID}>
					<DropoffAttachment
						canManage={canManageDropoff}
						onUploaded={onUploaded}
						order={order}
					/>
					{hasManyPickups ? null : <PickupTiles items={pickupItems} />}
				</div>
				{hasManyPickups ? (
					<div className="grid gap-1.5">
						<AttachmentLabel>Pickups</AttachmentLabel>
						<div className={TILE_GRID}>
							<PickupTiles items={pickupItems} />
						</div>
					</div>
				) : null}
			</Card>
		</section>
	);
};

interface AttachmentLabelProps {
	children: string;
}

const AttachmentLabel = ({ children }: AttachmentLabelProps) => (
	<p className="font-medium text-muted-foreground text-subhead">{children}</p>
);

interface TileCaptionProps {
	line1?: ReactNode;
	line2: ReactNode;
}

const TileCaption = ({ line1, line2 }: TileCaptionProps) => (
	<div className="grid gap-0.5 text-subhead">
		{line1 ? <p className="font-medium tabular-nums">{line1}</p> : null}
		<div>{line2}</div>
	</div>
);

interface DropoffAttachmentProps {
	order: DropoffOrder;
	canManage: boolean;
	onUploaded: () => Promise<void>;
}

const DropoffAttachment = ({
	order,
	canManage,
	onUploaded,
}: DropoffAttachmentProps) => {
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	const photoUrl = order.dropoff_photo_url;

	return (
		<section className="grid content-start gap-1.5">
			<AttachmentLabel>Drop-off</AttachmentLabel>
			{photoUrl ? (
				<DropoffPhoto
					capturedAt={order.dropoff_photo_uploaded_at ?? order.created_at}
					imageUrl={photoUrl}
					orderId={order.id}
				/>
			) : (
				<div className={EMPTY_TILE}>
					<HugeiconsIcon
						icon={Camera01Icon}
						aria-hidden="true"
						className="size-8 opacity-50"
					/>
				</div>
			)}
			<TileCaption
				line1={
					order.dropoff_photo_uploaded_at
						? formatOrderDateTime(order.dropoff_photo_uploaded_at)
						: undefined
				}
				line2={
					<button
						className="inline-flex h-9 items-center gap-1.5 text-link disabled:text-muted-foreground pointer-coarse:h-11"
						disabled={!canManage}
						onClick={() => setIsDialogOpen(true)}
						type="button"
					>
						<HugeiconsIcon
							icon={Camera01Icon}
							aria-hidden="true"
							className="size-4"
						/>
						{photoUrl ? "Replace photo" : "Upload photo"}
					</button>
				}
			/>
			<SinglePhotoUploadDialog
				badgeLabel="Drop-off"
				onOpenChange={setIsDialogOpen}
				onUploaded={onUploaded}
				open={isDialogOpen}
				title="Upload drop-off photo"
				uploader={orderDropoffPhotoUploader(order.id)}
			/>
		</section>
	);
};

interface DropoffPhotoProps {
	capturedAt: string;
	imageUrl: string;
	orderId: number;
}

// An order has exactly one drop-off photo, so it gets its own tile rather than
// a seat in the pickup gallery — the counter staff open this to check what
// came in before the complaint desk argues about it.
const DropoffPhoto = ({ capturedAt, imageUrl, orderId }: DropoffPhotoProps) => {
	const [isLightboxOpen, setIsLightboxOpen] = useState(false);

	const item: PhotoLightboxItem = {
		alt: "Order drop-off",
		created_at: capturedAt,
		download: { kind: "dropoff", id: orderId },
		id: orderId,
		image_url: imageUrl,
		primaryLabel: "Drop-off photo",
	};

	return (
		<div>
			<button
				aria-label="Open drop-off photo"
				className="block w-full overflow-hidden rounded-md border border-border bg-muted transition-[border-color,box-shadow] hover:border-ring focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
				onClick={() => setIsLightboxOpen(true)}
				type="button"
			>
				<img
					alt={item.alt}
					className="aspect-square w-full bg-muted object-cover"
					decoding="async"
					height={480}
					loading="lazy"
					src={imageUrl}
					width={480}
				/>
			</button>

			<PhotoLightbox
				items={[item]}
				onOpenChange={setIsLightboxOpen}
				open={isLightboxOpen}
				title="Drop-off photo"
			/>
		</div>
	);
};

// Pickup photos are required at capture, so every event carries an image; the
// caption keeps the "when / by whom" audit trail this section is the only
// home for.
const toPickupItems = (pickupEvents: PickupEvent[]): OrderPhotoGalleryItem[] =>
	pickupEvents
		.filter((event) => Boolean(event.image_url))
		.map((event) => {
			const pickedUpAt = formatOrderDateTime(event.picked_up_at);
			const pickedUpBy = event.picked_up_by?.name ?? "unknown operator";
			return {
				alt: `Pickup on ${pickedUpAt} by ${pickedUpBy}`,
				caption: <TileCaption line1={pickedUpAt} line2={`by ${pickedUpBy}`} />,
				created_at: event.picked_up_at,
				download: { kind: "pickup" as const, id: event.id },
				id: event.id,
				image_url: event.image_url ?? "",
				note: `Pickup · ${pickedUpBy}`,
			};
		});

interface PickupTilesProps {
	items: OrderPhotoGalleryItem[];
}

// The tiles land on the caller's grid, beside the drop-off or on a row of
// their own.
const PickupTiles = ({ items }: PickupTilesProps) => (
	<OrderPhotoGallery
		emptyState={
			<section className="grid content-start gap-1.5">
				<AttachmentLabel>Pickup</AttachmentLabel>
				<div className={EMPTY_TILE}>
					<HugeiconsIcon
						icon={Camera01Icon}
						aria-hidden="true"
						className="size-8 opacity-50"
					/>
				</div>
				<TileCaption line2="No pickups yet" />
			</section>
		}
		gridClassName="contents"
		items={
			items.length === 1
				? [{ ...items[0], label: <AttachmentLabel>Pickup</AttachmentLabel> }]
				: items
		}
		title="Pickup photo"
	/>
);
