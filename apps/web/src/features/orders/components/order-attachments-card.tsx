import { CameraIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	getPhotoDownloadName,
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
import type { OrderDetail } from "@/lib/api";

type PickupEvent = OrderDetail["pickup_events"][number];

type DropoffOrder = Pick<
	OrderDetail,
	"id" | "created_at" | "dropoff_photo_url" | "dropoff_photo_uploaded_at"
>;

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
}: OrderAttachmentsCardProps) => (
	<Card className="gap-0 overflow-hidden py-0">
		<OrderSectionHeader>Attachments</OrderSectionHeader>
		<div className="grid gap-6 border-t p-4 md:grid-cols-3">
			<DropoffAttachment
				canManage={canManageDropoff}
				onUploaded={onUploaded}
				order={order}
			/>
			<PickupsAttachment pickupEvents={pickupEvents} />
		</div>
	</Card>
);

const AttachmentLabel = ({ children }: { children: string }) => (
	<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
		{children}
	</p>
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
	const isSaved = Boolean(photoUrl);

	return (
		<section className="grid content-start gap-3">
			<div className="flex items-center justify-between gap-2">
				<AttachmentLabel>Drop-off</AttachmentLabel>
				<Badge variant={isSaved ? "secondary" : "outline"}>
					{isSaved ? "Saved" : "Missing"}
				</Badge>
			</div>

			{photoUrl ? (
				<DropoffPhoto
					capturedAt={order.dropoff_photo_uploaded_at ?? order.created_at}
					imageUrl={photoUrl}
					orderId={order.id}
				/>
			) : (
				<div className="flex aspect-16/10 flex-col items-center justify-center gap-2 border bg-muted px-4 text-center text-muted-foreground">
					<CameraIcon className="size-8 opacity-50" />
					<p className="text-sm">No drop-off photo yet</p>
				</div>
			)}

			{order.dropoff_photo_uploaded_at ? (
				<p className="text-muted-foreground text-xs">
					Uploaded {formatOrderDateTime(order.dropoff_photo_uploaded_at)}
				</p>
			) : null}

			<Button
				className="h-11 w-full"
				disabled={!canManage}
				icon={<CameraIcon className="size-4" />}
				onClick={() => setIsDialogOpen(true)}
				type="button"
				variant="outline"
			>
				{isSaved ? "Replace photo" : "Upload photo"}
			</Button>

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

// An order has exactly one drop-off photo, so it gets a full-width hero tile
// rather than a seat in the pickup thumbnail strip — the counter staff open this
// to check what came in before the complaint desk argues about it.
const DropoffPhoto = ({ capturedAt, imageUrl, orderId }: DropoffPhotoProps) => {
	const [isLightboxOpen, setIsLightboxOpen] = useState(false);

	const item: PhotoLightboxItem = {
		alt: "Order drop-off",
		created_at: capturedAt,
		id: orderId,
		image_url: imageUrl,
		primaryLabel: "Drop-off photo",
	};

	return (
		<div className="group relative">
			<button
				aria-label="Open drop-off photo"
				className="block w-full overflow-hidden border border-border bg-muted transition-[border-color,box-shadow] hover:border-ring focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
				onClick={() => setIsLightboxOpen(true)}
				type="button"
			>
				<img
					alt={item.alt}
					className="aspect-16/10 w-full bg-muted object-cover"
					decoding="async"
					height={400}
					loading="lazy"
					src={imageUrl}
					width={640}
				/>
			</button>

			<div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
				<Button
					className="pointer-events-auto border-black/10 bg-background/90 text-foreground hover:bg-background"
					nativeButton={false}
					render={
						<a
							aria-label="Save drop-off photo"
							download={getPhotoDownloadName(item)}
							href={imageUrl}
						>
							<DownloadSimpleIcon aria-hidden="true" className="size-4" />
							<span className="sr-only">Save drop-off photo</span>
						</a>
					}
					size="icon-sm"
					title="Save image"
					variant="outline"
				/>
			</div>

			<PhotoLightbox
				items={[item]}
				onOpenChange={setIsLightboxOpen}
				open={isLightboxOpen}
				title="Drop-off photo"
			/>
		</div>
	);
};

const PickupsAttachment = ({
	pickupEvents,
}: {
	pickupEvents: PickupEvent[];
}) => {
	// Pickup photos are required at capture, so every event carries an image;
	// the gallery owns the thumbnail grid + lightbox, the caption keeps the
	// at-a-glance "when / by whom" audit trail this section is the only home for.
	const items: OrderPhotoGalleryItem[] = pickupEvents
		.filter((event) => Boolean(event.image_url))
		.map((event) => {
			const pickedUpAt = formatOrderDateTime(event.picked_up_at);
			const pickedUpBy = event.picked_up_by?.name ?? "unknown operator";
			return {
				alt: `Pickup on ${pickedUpAt} by ${pickedUpBy}`,
				caption: (
					<div className="grid gap-0.5">
						<p className="font-medium text-sm leading-tight">{pickedUpAt}</p>
						<p className="text-muted-foreground text-xs">by {pickedUpBy}</p>
					</div>
				),
				created_at: event.picked_up_at,
				id: event.id,
				image_url: event.image_url ?? "",
				note: `Pickup · ${pickedUpBy}`,
			};
		});

	return (
		<section className="grid content-start gap-3 md:col-span-2">
			<AttachmentLabel>Pickups</AttachmentLabel>
			<OrderPhotoGallery
				emptyState={
					<p className="text-muted-foreground text-sm">No pickups yet.</p>
				}
				gridClassName="grid-cols-2 gap-3 sm:grid-cols-3"
				items={items}
				thumbnailImageClassName="aspect-16/10"
				title="Pickup photo"
			/>
		</section>
	);
};
