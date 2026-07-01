import { DownloadSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import type * as React from "react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
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
	onDelete?: (id: number) => void;
	deletingId?: number | null;
	thumbnailClassName?: string;
	thumbnailImageClassName?: string;
	title?: string;
};

function getPhotoDownloadName(item: OrderPhotoGalleryItem) {
	const pathname = new URL(item.image_url, "https://fresclean.local").pathname;
	const extension = pathname.split(".").pop()?.toLowerCase();
	const resolvedExtension =
		extension && extension.length <= 5 ? extension : "jpg";

	return `photo-${item.id}.${resolvedExtension}`;
}

export function OrderPhotoGallery({
	emptyState,
	gridClassName,
	items,
	onDelete,
	deletingId,
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
		created_at: item.created_at,
		id: item.id,
		image_url: item.image_url,
		note: item.note,
	}));

	return (
		<>
			<div
				className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", gridClassName)}
			>
				{items.map((item, index) => (
					<div className="group relative" key={item.id}>
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

						<div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-1 p-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
							<Button
								className="pointer-events-auto border-black/10 bg-background/90 text-foreground hover:bg-background"
								nativeButton={false}
								render={
									<a
										aria-label={`Save ${getPhotoPrimaryLabel(item)} image`}
										download={getPhotoDownloadName(item)}
										href={item.image_url}
									>
										<DownloadSimpleIcon className="size-4" aria-hidden="true" />
										<span className="sr-only">
											{`Save ${getPhotoPrimaryLabel(item)} image`}
										</span>
									</a>
								}
								size="icon-sm"
								title="Save image"
								variant="outline"
							/>
							{onDelete && item.canDelete ? (
								<Button
									aria-label={`Delete ${getPhotoPrimaryLabel(item)} image`}
									className="pointer-events-auto border-black/10 bg-background/90 text-destructive hover:border-destructive/40 hover:bg-destructive/10"
									disabled={deletingId === item.id}
									icon={<TrashIcon className="size-4" aria-hidden="true" />}
									loading={deletingId === item.id}
									onClick={() => onDelete(item.id)}
									size="icon-sm"
									title="Delete photo"
									type="button"
									variant="outline"
								/>
							) : null}
						</div>

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
