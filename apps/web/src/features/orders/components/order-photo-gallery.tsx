import { DownloadSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import type * as React from "react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	formatPhotoTimestamp,
	getPhotoPrimaryLabel,
	PhotoLightbox,
	type PhotoLightboxItem,
} from "@/features/orders/components/photo-lightbox";
import { cn } from "@/lib/utils";

export type OrderPhotoGalleryItem = {
	alt: string;
	canDelete?: boolean;
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
			<div className={cn("grid gap-3 sm:grid-cols-2", gridClassName)}>
				{items.map((item, index) => (
					<div key={item.id} className="group relative">
						<button
							type="button"
							className={cn(
								"grid w-full gap-2 border border-border bg-background p-2 text-left transition-[border-color,background-color,box-shadow,opacity] hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
								thumbnailClassName,
							)}
							onClick={() => openAtIndex(index)}
							aria-label={`Open ${getPhotoPrimaryLabel(item)} image ${index + 1} of ${imageCount}`}
						>
							<img
								src={item.image_url}
								alt={item.alt}
								width={960}
								height={768}
								className={cn(
									"aspect-[4/3] w-full bg-muted object-cover",
									thumbnailImageClassName,
								)}
								loading="lazy"
							/>
							<div className="grid gap-1 pr-10">
								<p className="text-xs font-medium">
									{getPhotoPrimaryLabel(item)}
								</p>
								<p className="text-xs text-muted-foreground">
									{formatPhotoTimestamp(item.created_at)}
								</p>
							</div>
						</button>

						<Button
							nativeButton={false}
							render={
								<a
									href={item.image_url}
									download={getPhotoDownloadName(item)}
									aria-label={`Save ${getPhotoPrimaryLabel(item)} image`}
								>
									<DownloadSimpleIcon className="size-4" aria-hidden="true" />
									<span className="sr-only">
										{`Save ${getPhotoPrimaryLabel(item)} image`}
									</span>
								</a>
							}
							variant="outline"
							size="icon-sm"
							className="absolute top-3 right-3 border-black/10 bg-background text-foreground hover:border-border hover:bg-background hover:text-foreground"
							title="Save image"
						/>
						{onDelete && item.canDelete ? (
							<Button
								type="button"
								variant="outline"
								size="icon-sm"
								className="absolute top-3 right-12 border-black/10 bg-background text-destructive hover:border-destructive/40 hover:bg-destructive/10"
								onClick={() => onDelete(item.id)}
								disabled={deletingId === item.id}
								aria-label={`Delete ${getPhotoPrimaryLabel(item)} image`}
								title="Delete photo"
								icon={<TrashIcon className="size-4" aria-hidden="true" />}
								loading={deletingId === item.id}
							/>
						) : null}
					</div>
				))}
			</div>

			<PhotoLightbox
				open={isOpen}
				onOpenChange={setIsOpen}
				items={lightboxItems}
				initialIndex={activeIndex}
				title={title}
			/>
		</>
	);
}
