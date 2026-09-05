import type * as React from "react";
import { useCallback, useState } from "react";
import {
	getPhotoPrimaryLabel,
	PhotoLightbox,
	type PhotoLightboxItem,
} from "@/features/orders/components/photo-lightbox";
import { cn } from "@/lib/utils";

export type OrderPhotoGalleryItem = {
	alt: string;
	canDelete?: boolean;
	caption?: React.ReactNode;
	created_at: string;
	id: number;
	image_url: string;
	note?: string | null;
};

type OrderPhotoGalleryProps = {
	emptyState?: React.ReactNode;
	gridClassName?: string;
	items: OrderPhotoGalleryItem[];
	onDelete?: (id: number) => Promise<void>;
	thumbnailClassName?: string;
	thumbnailImageClassName?: string;
	title?: string;
};

export function OrderPhotoGallery({
	emptyState,
	gridClassName,
	items,
	onDelete,
	thumbnailClassName,
	thumbnailImageClassName,
	title = "Attachment Viewer",
}: OrderPhotoGalleryProps) {
	const [activeIndex, setActiveIndex] = useState(0);
	const [isOpen, setIsOpen] = useState(false);

	const imageCount = items.length;

	const openAtIndex = useCallback((index: number) => {
		setActiveIndex(index);
		setIsOpen(true);
	}, []);

	if (items.length === 0) {
		return emptyState ?? null;
	}

	const lightboxItems: PhotoLightboxItem[] = items.map((item) => ({
		alt: item.alt,
		canDelete: item.canDelete,
		created_at: item.created_at,
		id: item.id,
		image_url: item.image_url,
		note: item.note,
	}));

	return (
		<>
			<div
				className={cn(
					// Keep this default variant-free: tailwind-merge only resolves
					// conflicts inside a variant, so a `sm:` here would outrank every
					// unprefixed grid-cols-* a caller passes.
					"grid grid-cols-3 gap-2",
					gridClassName,
				)}
			>
				{items.map((item, index) => (
					<div key={item.id}>
						<button
							aria-label={`Open ${getPhotoPrimaryLabel(item)} image ${index + 1} of ${imageCount}`}
							className={cn(
								"block w-full overflow-hidden border border-border bg-muted transition-[border-color,box-shadow] hover:border-ring focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
								thumbnailClassName,
							)}
							onClick={() => openAtIndex(index)}
							type="button"
						>
							<img
								alt={item.alt}
								className={cn(
									"aspect-square w-full bg-muted object-cover",
									thumbnailImageClassName,
								)}
								decoding="async"
								height={480}
								loading="lazy"
								src={item.image_url}
								width={480}
							/>
						</button>

						{item.caption ? <div className="mt-1.5">{item.caption}</div> : null}
					</div>
				))}
			</div>

			<PhotoLightbox
				initialIndex={activeIndex}
				items={lightboxItems}
				onDelete={onDelete ? (id) => onDelete(Number(id)) : undefined}
				onOpenChange={setIsOpen}
				open={isOpen}
				title={title}
			/>
		</>
	);
}
