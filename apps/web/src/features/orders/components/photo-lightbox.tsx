import {
	Cancel01Icon,
	Delete02Icon,
	Download04Icon,
	Image02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import type { PhotoDownloadRef } from "@/features/orders/api";
import { PhotoStage } from "@/features/orders/components/photo-stage";
import { savePhoto } from "@/features/orders/utils/photo-download";
import {
	ITEM_PHOTO_TILE_SIZE,
	photoTileUrl,
	type TileSize,
} from "@/features/orders/utils/photo-tile";
import { readServerErrorMessage } from "@/lib/server-error";
import { cn } from "@/lib/utils";

export interface PhotoLightboxItem {
	alt: string;
	canDelete?: boolean;
	created_at: string;
	// Where the photo is filed, for Save. Absent on a preview nothing is filed for yet.
	download?: PhotoDownloadRef;
	id: number | string;
	image_url: string;
	note?: string | null;
}

interface PhotoLightboxProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: PhotoLightboxItem[];
	initialIndex?: number;
	title?: string;
	// The size the opening screen already tiles these photos at, so the filmstrip reuses it.
	tileSize?: TileSize;
	// Resolves once the photo is gone from `items`, rejects if it is not.
	onDelete?: (id: number | string) => Promise<void>;
}

// Grey glass, so the controls still read over a white sneaker on a white counter.
const FROSTED = "bg-zinc-800/60 backdrop-blur-xl backdrop-saturate-150";

const ROUND_BUTTON = cn(
	FROSTED,
	"pointer-events-auto grid size-11 place-items-center rounded-full text-white transition hover:bg-zinc-700/70 active:scale-95 disabled:opacity-50",
);

interface DeleteConfirmProps {
	isDeleting: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}

// Phone: the iOS action sheet, within thumb reach at the bottom.
const DeleteActionSheet = ({
	isDeleting,
	onCancel,
	onConfirm,
}: DeleteConfirmProps) => (
	<div className="pointer-events-auto flex w-full max-w-[22rem] flex-col gap-2 md:hidden">
		<div className={cn(FROSTED, "overflow-hidden rounded-xl")}>
			<p className="border-white/15 border-b px-4 pt-3.5 pb-3 text-center text-subhead text-white/65">
				This photo will be deleted.
			</p>
			<button
				className="h-14 w-full text-destructive text-title-3 disabled:opacity-50"
				disabled={isDeleting}
				onClick={onConfirm}
				type="button"
			>
				Delete Photo
			</button>
		</div>
		<button
			className={cn(
				FROSTED,
				"h-14 w-full rounded-xl font-medium text-primary text-title-3 disabled:opacity-50",
			)}
			disabled={isDeleting}
			onClick={onCancel}
			type="button"
		>
			Cancel
		</button>
	</div>
);

// Desktop: a centred alert, as Mac Photos asks.
const DeleteAlert = ({
	isDeleting,
	onCancel,
	onConfirm,
}: DeleteConfirmProps) => (
	<div className="pointer-events-none absolute inset-0 hidden place-items-center px-4 md:grid">
		<div
			className={cn(
				FROSTED,
				"pointer-events-auto grid w-[17rem] gap-1 rounded-2xl p-4 text-center",
			)}
		>
			<p className="font-medium text-headline">Delete Photo?</p>
			<p className="text-subhead text-white/65">This photo will be deleted.</p>
			<div className="mt-3 grid grid-cols-2 gap-2">
				<button
					className="h-9 rounded-lg bg-white/15 font-medium text-subhead transition hover:bg-white/25 disabled:opacity-50"
					disabled={isDeleting}
					onClick={onCancel}
					type="button"
				>
					Cancel
				</button>
				<button
					className="h-9 rounded-lg bg-destructive font-medium text-subhead text-white transition hover:bg-destructive/85 disabled:opacity-50"
					disabled={isDeleting}
					onClick={onConfirm}
					type="button"
				>
					Delete
				</button>
			</div>
		</div>
	</div>
);

interface FilmstripProps {
	activeIndex: number;
	items: PhotoLightboxItem[];
	onSelect: (index: number) => void;
	tileSize: TileSize;
}

const Filmstrip = ({
	activeIndex,
	items,
	onSelect,
	tileSize,
}: FilmstripProps) => {
	const stripRef = useRef<HTMLDivElement>(null);
	const hasScrolledRef = useRef(false);

	useEffect(() => {
		stripRef.current?.children[activeIndex]?.scrollIntoView({
			behavior: hasScrolledRef.current ? "smooth" : "instant",
			block: "nearest",
			inline: "center",
		});
		hasScrolledRef.current = true;
	}, [activeIndex]);

	return (
		<div
			className="pointer-events-auto flex h-11 max-w-full items-center gap-0.5 overflow-x-auto [scrollbar-width:none]"
			ref={stripRef}
		>
			{items.map((item, index) => (
				<button
					aria-current={index === activeIndex}
					aria-label={`Photo ${index + 1}`}
					className={cn(
						"shrink-0 overflow-hidden rounded-xs",
						index === activeIndex
							? "size-11 outline-2 -outline-offset-2 outline-white"
							: "h-10 w-7 opacity-85",
					)}
					key={item.id}
					onClick={() => onSelect(index)}
					type="button"
				>
					<img
						alt=""
						className="size-full object-cover"
						decoding="async"
						draggable={false}
						loading="lazy"
						src={photoTileUrl(item.image_url, tileSize)}
					/>
				</button>
			))}
		</div>
	);
};

export const PhotoLightbox = ({
	open,
	onOpenChange,
	items,
	initialIndex = 0,
	title = "Attachment Viewer",
	tileSize = ITEM_PHOTO_TILE_SIZE,
	onDelete,
}: PhotoLightboxProps) => {
	const [activeIndex, setActiveIndex] = useState(initialIndex);
	// The photo the confirm was opened for, so a swipe or a refetch never
	// deletes a different one.
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<
		number | string | null
	>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [wasOpen, setWasOpen] = useState(open);

	// Reset during render, so the first frame already shows the tapped photo.
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setActiveIndex(initialIndex);
			setConfirmingDeleteId(null);
		}
	}

	const imageCount = items.length;
	const canNavigate = imageCount > 1;
	const activeItem = items[activeIndex];
	const takenAt = activeItem ? dayjs(activeItem.created_at) : null;
	const note = activeItem?.note?.trim();
	const isConfirmingDelete =
		activeItem !== undefined && confirmingDeleteId === activeItem.id;

	// Exactly one photo leaves per delete: step to the neighbour, or close on
	// the last one. Decided here rather than watched from `items`, because the
	// gallery unmounts an empty viewer before any effect could see zero.
	const handleDelete = async () => {
		if (!(isConfirmingDelete && onDelete)) {
			return;
		}
		setIsDeleting(true);
		try {
			await onDelete(confirmingDeleteId);
			if (imageCount === 1) {
				onOpenChange(false);
			} else {
				setActiveIndex(Math.min(activeIndex, imageCount - 2));
			}
		} catch {
			// The caller has already reported the failure; the photo stays.
		} finally {
			setIsDeleting(false);
			setConfirmingDeleteId(null);
		}
	};

	const handleSave = async () => {
		if (!activeItem) {
			return;
		}
		setIsSaving(true);
		try {
			await savePhoto(activeItem.download, activeItem.image_url);
		} catch (error) {
			toast.error(readServerErrorMessage(error, "Couldn't save photo"));
		} finally {
			setIsSaving(false);
		}
	};

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

				{/* The controls sit beside the stage, not inside it: the stage blocks the
				    browser's own panning, which would freeze a long filmstrip on iPad. */}
				<div className="relative flex min-h-0 flex-1 flex-col bg-black">
					{activeItem ? (
						<PhotoStage
							activeIndex={activeIndex}
							items={items}
							onIndexChange={setActiveIndex}
						/>
					) : (
						<div className="flex min-h-0 flex-1 items-center justify-center">
							<div className="grid place-items-center gap-2 px-6 py-12 text-center text-body text-white/72">
								<HugeiconsIcon
									icon={Image02Icon}
									className="size-6"
									aria-hidden="true"
								/>
								<p>No image selected</p>
							</div>
						</div>
					)}

					<div className="pointer-events-none absolute inset-x-0 top-0 grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)_+_1rem)]">
						<button
							aria-label="Close"
							className={ROUND_BUTTON}
							onClick={() => onOpenChange(false)}
							type="button"
						>
							<HugeiconsIcon
								icon={Cancel01Icon}
								className="size-5"
								aria-hidden="true"
							/>
						</button>
						{takenAt?.isValid() ? (
							<time
								className="grid text-center [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]"
								dateTime={activeItem?.created_at}
							>
								<span className="font-medium text-headline">
									{takenAt.format("D MMM YYYY")}
								</span>
								<span className="text-footnote text-white/75 tabular-nums">
									{takenAt.format("HH:mm")}
								</span>
							</time>
						) : null}
						<span aria-hidden="true" className="size-11" />
					</div>

					{activeItem ? (
						<div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)_+_1rem)]">
							{isConfirmingDelete ? (
								<DeleteActionSheet
									isDeleting={isDeleting}
									onCancel={() => setConfirmingDeleteId(null)}
									onConfirm={handleDelete}
								/>
							) : null}
							<div
								className={cn(
									"contents",
									isConfirmingDelete && "max-md:hidden",
								)}
							>
								{note ? (
									<p
										className={cn(
											FROSTED,
											"line-clamp-3 max-w-[92%] rounded-xl px-3.5 py-2 text-center text-subhead",
										)}
									>
										{note}
									</p>
								) : null}
								{canNavigate ? (
									<Filmstrip
										activeIndex={activeIndex}
										items={items}
										onSelect={setActiveIndex}
										tileSize={tileSize}
									/>
								) : null}
								<div className="flex w-full items-center justify-between">
									<button
										aria-label="Save image"
										className={ROUND_BUTTON}
										disabled={isSaving}
										onClick={handleSave}
										title="Save image"
										type="button"
									>
										<HugeiconsIcon
											icon={Download04Icon}
											aria-hidden="true"
											className="size-5"
										/>
									</button>
									{onDelete && activeItem.canDelete ? (
										<button
											aria-label="Delete photo"
											className={ROUND_BUTTON}
											onClick={() => setConfirmingDeleteId(activeItem.id)}
											title="Delete photo"
											type="button"
										>
											<HugeiconsIcon
												icon={Delete02Icon}
												aria-hidden="true"
												className="size-5"
											/>
										</button>
									) : null}
								</div>
							</div>
						</div>
					) : null}

					{isConfirmingDelete ? (
						<DeleteAlert
							isDeleting={isDeleting}
							onCancel={() => setConfirmingDeleteId(null)}
							onConfirm={handleDelete}
						/>
					) : null}
				</div>
			</DialogContent>
		</Dialog>
	);
};
