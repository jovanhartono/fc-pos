import type * as React from "react";
import { useCallback, useState } from "react";
import type { PhotoDownloadRef } from "@/features/orders/api";
import {
	getPhotoPrimaryLabel,
	PhotoLightbox,
	type PhotoLightboxItem,
} from "@/features/orders/components/photo-lightbox";
import { cn } from "@/lib/utils";

export type OrderPhotoGalleryItem = {
	alt: string;
	caption?: React.ReactNode;
	created_at: string;
	download?: PhotoDownloadRef;
	id: number;
	image_url: string;
	label?: React.ReactNode;
	note?: string | null;
};

type OrderPhotoGalleryProps = {
	emptyState?: React.ReactNode;
	gridClassName?: string;
	items: OrderPhotoGalleryItem[];
	title?: string;
};

export function OrderPhotoGallery({
	emptyState,
	gridClassName,
	items,
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
		created_at: item.created_at,
		download: item.download,
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
						{item.label ? <div className="mb-1.5">{item.label}</div> : null}
						<button
							aria-label={`Open ${getPhotoPrimaryLabel(item)} image ${index + 1} of ${imageCount}`}
							className="block w-full overflow-hidden rounded-md border border-border bg-muted transition-[border-color,box-shadow] hover:border-ring focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
							onClick={() => openAtIndex(index)}
							type="button"
						>
							<img
								alt={item.alt}
								className="aspect-square w-full bg-muted object-cover"
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
				onOpenChange={setIsOpen}
				open={isOpen}
				title={title}
			/>
		</>
	);
}
