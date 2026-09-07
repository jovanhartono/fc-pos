import { PlusIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PhotoLightbox } from "@/features/orders/components/photo-lightbox";
import { PhotoUploadDialog } from "@/features/orders/components/photo-upload-dialog";
import { useRefreshOrder } from "@/features/orders/hooks/useOrderMutations";
import { startPhotoBlocker } from "@/features/orders/lib/order-action-gates";
import type { OrderItem } from "@/features/orders/lib/order-lines";
import { itemPhotoUploader } from "@/features/orders/utils/photo-upload";
import { useIsMobile } from "@/hooks/use-mobile";
import { deleteItemPhoto } from "@/lib/api";
import { readServerErrorMessage } from "@/lib/server-error";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/stores/auth-store";

const TILE_CLASS = "size-12 shrink-0 sm:size-20";
const TILE_BUTTON_CLASS =
	"block overflow-hidden border border-border bg-muted transition-[border-color,box-shadow] hover:border-ring focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50";

// A busy pair can carry twenty-odd shots. The strip stays one row so every
// Item card is the same height and the treatments stay under the header;
// the rest is one swipe away in the viewer. Four photos plus the overflow and
// add tiles is what a 390px card fits without clipping.
const VISIBLE_TILES = { phone: 4, desktop: 5 };

interface ItemPhotoStripProps {
	orderId: number;
	item: OrderItem;
	isAdmin: boolean;
}

// The Item's before-service photos (ADR-0019), shown on the object itself so
// the cashier sees which shoes still need a shot without opening each
// treatment. The gate hint sits here for the same reason: it is the object
// that is missing a photo, not any one line.
export const ItemPhotoStrip = ({
	orderId,
	item,
	isAdmin,
}: ItemPhotoStripProps) => {
	const user = getCurrentUser();
	const refreshOrder = useRefreshOrder(orderId);
	const [isUploadOpen, setIsUploadOpen] = useState(false);
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const visibleTiles = useIsMobile(640)
		? VISIBLE_TILES.phone
		: VISIBLE_TILES.desktop;

	const deletePhotoMutation = useMutation({
		mutationFn: (photoId: number) => deleteItemPhoto(orderId, item.id, photoId),
		onSuccess: async () => {
			await refreshOrder();
			toast.success("Photo deleted");
		},
		onError: (error) => {
			toast.error(readServerErrorMessage(error, "Failed to delete photo"));
		},
	});

	const photoBlocker = item.services
		.map(startPhotoBlocker)
		.find((blocker) => blocker !== undefined);

	const images = item.images.map((image) => ({
		...image,
		alt: image.note ?? `Photo for ${item.item_code}`,
		canDelete: isAdmin || image.uploaded_by === user?.id,
	}));
	const visible = images.slice(0, visibleTiles);
	const hiddenCount = images.length - visible.length;

	return (
		<div className="flex items-center gap-2 px-4 pb-3">
			{visible.map((image, index) => (
				<button
					aria-label={`Open photo ${index + 1} of ${images.length}`}
					className={cn(TILE_CLASS, TILE_BUTTON_CLASS)}
					key={image.id}
					onClick={() => setLightboxIndex(index)}
					type="button"
				>
					<img
						alt={image.alt}
						className="aspect-square size-full object-cover"
						decoding="async"
						height={160}
						loading="lazy"
						src={image.image_url}
						width={160}
					/>
				</button>
			))}
			{hiddenCount > 0 ? (
				<button
					aria-label={`Open ${hiddenCount} more photos`}
					className={cn(
						TILE_CLASS,
						TILE_BUTTON_CLASS,
						"grid place-items-center font-medium text-muted-foreground text-sm tabular-nums",
					)}
					onClick={() => setLightboxIndex(visibleTiles)}
					type="button"
				>
					+{hiddenCount}
				</button>
			) : null}
			<button
				aria-label={`Add photo for ${item.item_code}`}
				className={cn(
					TILE_CLASS,
					"grid place-items-center border border-dashed border-border text-muted-foreground transition-colors hover:border-ring hover:text-foreground focus-visible:border-ring focus-visible:outline-none",
				)}
				onClick={() => setIsUploadOpen(true)}
				type="button"
			>
				<PlusIcon aria-hidden="true" className="size-5" />
			</button>
			{images.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					{photoBlocker ?? "No photos yet."}
				</p>
			) : null}
			<PhotoLightbox
				initialIndex={lightboxIndex ?? 0}
				items={images}
				onDelete={async (photoId) => {
					await deletePhotoMutation.mutateAsync(Number(photoId));
				}}
				onOpenChange={(open) => {
					if (!open) {
						setLightboxIndex(null);
					}
				}}
				open={lightboxIndex !== null}
				title={`Photos for ${item.item_code}`}
			/>
			<PhotoUploadDialog
				badgeLabel={item.item_code}
				onOpenChange={setIsUploadOpen}
				onUploaded={refreshOrder}
				open={isUploadOpen}
				title="Add item photo"
				uploader={itemPhotoUploader(orderId, item.id)}
			/>
		</div>
	);
};
