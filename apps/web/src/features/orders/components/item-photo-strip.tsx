import { PlusIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { OrderPhotoGallery } from "@/features/orders/components/order-photo-gallery";
import { PhotoUploadDialog } from "@/features/orders/components/photo-upload-dialog";
import { useRefreshOrder } from "@/features/orders/hooks/useOrderMutations";
import { startPhotoBlocker } from "@/features/orders/lib/order-action-gates";
import type { OrderItem } from "@/features/orders/lib/order-lines";
import { itemPhotoUploader } from "@/features/orders/utils/photo-upload";
import { deleteItemPhoto } from "@/lib/api";
import { readServerErrorMessage } from "@/lib/server-error";
import { getCurrentUser } from "@/stores/auth-store";

const TILE_CLASS = "size-20";

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

	return (
		<div className="flex flex-wrap items-start gap-2 px-4 pb-3">
			<OrderPhotoGallery
				gridClassName="flex flex-wrap gap-2"
				items={item.images.map((image) => ({
					...image,
					alt: image.note ?? `Photo for ${item.item_code}`,
					canDelete: isAdmin || image.uploaded_by === user?.id,
				}))}
				onDelete={async (photoId) => {
					await deletePhotoMutation.mutateAsync(photoId);
				}}
				thumbnailClassName={TILE_CLASS}
				title={`Photos for ${item.item_code}`}
			/>
			<button
				aria-label={`Add photo for ${item.item_code}`}
				className={`${TILE_CLASS} flex items-center justify-center border border-dashed border-border text-muted-foreground transition-colors hover:border-ring hover:text-foreground focus-visible:border-ring focus-visible:outline-none`}
				onClick={() => setIsUploadOpen(true)}
				type="button"
			>
				<PlusIcon aria-hidden="true" className="size-5" />
			</button>
			{item.images.length === 0 ? (
				<p className="self-center text-muted-foreground text-xs">
					{photoBlocker ?? "No photos yet."}
				</p>
			) : null}
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
