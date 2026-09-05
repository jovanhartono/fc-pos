import {
	CheckIcon,
	DownloadSimpleIcon,
	ImageSquareIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { PhotoStage } from "@/features/orders/components/photo-stage";
import { cn } from "@/lib/utils";

export interface PhotoLightboxItem {
	alt: string;
	canDelete?: boolean;
	created_at: string;
	id: number | string;
	image_url: string;
	note?: string | null;
	primaryLabel?: string;
}

interface PhotoLightboxProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: PhotoLightboxItem[];
	initialIndex?: number;
	title?: string;
	// Resolves once the photo is gone from `items`, rejects if it is not.
	onDelete?: (id: number | string) => Promise<void>;
}

function getPhotoDownloadName(item: {
	id: number | string;
	image_url: string;
}) {
	const pathname = new URL(item.image_url, "https://fresclean.local").pathname;
	const extension = pathname.split(".").pop()?.toLowerCase();
	const resolvedExtension =
		extension && extension.length <= 5 ? extension : "jpg";

	return `photo-${item.id}.${resolvedExtension}`;
}

export function getPhotoPrimaryLabel(item: {
	id: number | string;
	note?: string | null;
	primaryLabel?: string;
}) {
	if (item.primaryLabel?.trim()) {
		return item.primaryLabel;
	}
	return item.note?.trim() ? item.note : `Photo #${item.id}`;
}

export function formatPhotoTimestamp(createdAt: string) {
	const parsed = dayjs(createdAt);
	if (!parsed.isValid()) {
		return createdAt;
	}
	return parsed.format("DD MMM YYYY, HH:mm");
}

const ACTION_CLASS =
	"grid size-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20";

export const PhotoLightbox = ({
	open,
	onOpenChange,
	items,
	initialIndex = 0,
	title = "Attachment Viewer",
	onDelete,
}: PhotoLightboxProps) => {
	const [activeIndex, setActiveIndex] = useState(initialIndex);
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const imageCount = items.length;
	const canNavigate = imageCount > 1;
	const activeItem = items[activeIndex];

	useEffect(() => {
		if (open) {
			setActiveIndex(initialIndex);
			setIsConfirmingDelete(false);
		}
	}, [open, initialIndex]);

	// Exactly one photo leaves per delete: step to the neighbour, or close on
	// the last one. Decided here rather than watched from `items`, because the
	// gallery unmounts an empty viewer before any effect could see zero.
	const handleDelete = async () => {
		if (!(activeItem && onDelete)) {
			return;
		}
		setIsDeleting(true);
		try {
			await onDelete(activeItem.id);
			if (imageCount === 1) {
				onOpenChange(false);
			} else {
				setActiveIndex(Math.min(activeIndex, imageCount - 2));
			}
		} catch {
			// The caller has already reported the failure; the photo stays.
		} finally {
			setIsDeleting(false);
			setIsConfirmingDelete(false);
		}
	};

	const activeCaption = useMemo(() => {
		if (!activeItem) {
			return null;
		}

		return {
			indexLabel: `${activeIndex + 1} / ${imageCount}`,
			primary: getPhotoPrimaryLabel(activeItem),
			secondary: formatPhotoTimestamp(activeItem.created_at),
		};
	}, [activeIndex, activeItem, imageCount]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="inset-0 z-[60] flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-black p-0 text-white ring-0 sm:max-w-none"
				overlayClassName="z-[60] bg-black"
				overlayForceRender
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">{title}</DialogTitle>
				<DialogDescription className="sr-only">
					{canNavigate
						? "Pinch or double-tap to zoom. Swipe or use the arrow keys to move between attachments."
						: "Pinch or double-tap to zoom."}
				</DialogDescription>

				<div className="flex min-h-0 flex-1 flex-col bg-black">
					{activeItem ? (
						<PhotoStage
							activeIndex={activeIndex}
							className="bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_52%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.18))]"
							items={items}
							onIndexChange={setActiveIndex}
						>
							<button
								aria-label="Close"
								className={cn(
									ACTION_CLASS,
									"absolute top-[calc(env(safe-area-inset-top)_+_1rem)] right-4 z-10",
								)}
								onClick={() => onOpenChange(false)}
								type="button"
							>
								<XIcon className="size-5" aria-hidden="true" />
							</button>
						</PhotoStage>
					) : (
						<div className="relative flex min-h-0 flex-1 items-center justify-center">
							<div className="grid place-items-center gap-2 px-6 py-12 text-center text-sm text-white/72">
								<ImageSquareIcon className="size-6" aria-hidden="true" />
								<p>No image selected.</p>
							</div>
						</div>
					)}

					<div className="grid gap-2 border-t border-white/10 bg-zinc-950 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)_+_0.75rem)] text-white sm:grid-cols-[1fr_auto] sm:items-end">
						<div className="grid gap-1">
							<p className="text-sm font-medium">
								{activeCaption?.primary ?? "Attachment"}
							</p>
							<p className="text-xs text-white/70">
								{activeCaption?.secondary ?? "No metadata"}
							</p>
						</div>
						<div className="flex items-center justify-between gap-3 text-xs text-white/70 sm:justify-end">
							{canNavigate ? (
								<p className="md:hidden">Swipe to browse</p>
							) : (
								<span />
							)}
							<div className="flex items-center gap-3">
								<p className="font-mono tabular-nums">
									{activeCaption?.indexLabel ?? "0 / 0"}
								</p>
								{activeItem ? (
									<div className="flex items-center gap-1.5">
										{/* Real buttons, not a hover reveal: the shop runs on iPads,
										    where nothing hovers. */}
										{isConfirmingDelete ? (
											<>
												<p className="text-white">Delete photo?</p>
												<button
													aria-label="Confirm delete"
													className={cn(
														ACTION_CLASS,
														"bg-destructive hover:bg-destructive/80 disabled:opacity-50",
													)}
													disabled={isDeleting}
													onClick={handleDelete}
													type="button"
												>
													<CheckIcon aria-hidden="true" className="size-4" />
												</button>
												<button
													aria-label="Cancel delete"
													className={ACTION_CLASS}
													disabled={isDeleting}
													onClick={() => setIsConfirmingDelete(false)}
													type="button"
												>
													<XIcon aria-hidden="true" className="size-4" />
												</button>
											</>
										) : (
											<>
												<a
													aria-label="Save image"
													className={ACTION_CLASS}
													download={getPhotoDownloadName(activeItem)}
													href={activeItem.image_url}
													title="Save image"
												>
													<DownloadSimpleIcon
														aria-hidden="true"
														className="size-4"
													/>
												</a>
												{onDelete && activeItem.canDelete ? (
													<button
														aria-label="Delete photo"
														className={ACTION_CLASS}
														onClick={() => setIsConfirmingDelete(true)}
														title="Delete photo"
														type="button"
													>
														<TrashIcon aria-hidden="true" className="size-4" />
													</button>
												) : null}
											</>
										)}
									</div>
								) : null}
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
