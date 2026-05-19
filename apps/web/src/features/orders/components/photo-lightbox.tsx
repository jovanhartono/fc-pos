import {
	ArrowLeftIcon,
	ArrowRightIcon,
	ImageSquareIcon,
} from "@phosphor-icons/react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";

const SWIPE_THRESHOLD = 56;

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
});

export interface PhotoLightboxItem {
	alt: string;
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
	const timestamp = new Date(createdAt);
	if (Number.isNaN(timestamp.getTime())) {
		return createdAt;
	}
	return dateTimeFormatter.format(timestamp);
}

export const PhotoLightbox = ({
	open,
	onOpenChange,
	items,
	initialIndex = 0,
	title = "Attachment Viewer",
}: PhotoLightboxProps) => {
	const [activeIndex, setActiveIndex] = useState(initialIndex);
	const pointerStateRef = useRef<{
		deltaX: number;
		deltaY: number;
		id: number | null;
		startX: number;
		startY: number;
	}>({
		deltaX: 0,
		deltaY: 0,
		id: null,
		startX: 0,
		startY: 0,
	});

	useEffect(() => {
		if (open) {
			setActiveIndex(initialIndex);
		}
	}, [open, initialIndex]);

	const imageCount = items.length;
	const canNavigate = imageCount > 1;
	const activeItem = items[activeIndex];

	const showPrevious = useCallback(() => {
		if (!canNavigate) {
			return;
		}
		setActiveIndex((currentIndex) =>
			currentIndex === 0 ? imageCount - 1 : currentIndex - 1,
		);
	}, [canNavigate, imageCount]);

	const showNext = useCallback(() => {
		if (!canNavigate) {
			return;
		}
		setActiveIndex((currentIndex) =>
			currentIndex === imageCount - 1 ? 0 : currentIndex + 1,
		);
	}, [canNavigate, imageCount]);

	useEffect(() => {
		if (!open) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				showPrevious();
			}

			if (event.key === "ArrowRight") {
				event.preventDefault();
				showNext();
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [open, showNext, showPrevious]);

	const resetPointerState = () => {
		pointerStateRef.current = {
			deltaX: 0,
			deltaY: 0,
			id: null,
			startX: 0,
			startY: 0,
		};
	};

	const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (
		event,
	) => {
		if (!canNavigate || event.pointerType === "mouse") {
			return;
		}

		pointerStateRef.current = {
			deltaX: 0,
			deltaY: 0,
			id: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
		};
	};

	const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (
		event,
	) => {
		if (pointerStateRef.current.id !== event.pointerId) {
			return;
		}

		pointerStateRef.current.deltaX =
			event.clientX - pointerStateRef.current.startX;
		pointerStateRef.current.deltaY =
			event.clientY - pointerStateRef.current.startY;
	};

	const commitSwipe = () => {
		const { deltaX, deltaY, id } = pointerStateRef.current;
		if (id === null) {
			return;
		}

		if (
			Math.abs(deltaX) >= SWIPE_THRESHOLD &&
			Math.abs(deltaX) > Math.abs(deltaY)
		) {
			if (deltaX < 0) {
				showNext();
			} else {
				showPrevious();
			}
		}

		resetPointerState();
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
				className="max-w-[calc(100%-1rem)] gap-0 overflow-hidden border-border bg-background p-0 text-foreground shadow-2xl sm:max-w-5xl [overscroll-behavior:contain]"
				showCloseButton
			>
				<DialogTitle className="sr-only">{title}</DialogTitle>
				<DialogDescription className="sr-only">
					Browse order attachments and swipe between images.
				</DialogDescription>

				<div className="grid bg-black">
					<div
						className="relative flex min-h-[320px] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_52%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.18))] px-3 py-12 sm:min-h-[560px] sm:px-14 [touch-action:pan-y]"
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={commitSwipe}
						onPointerCancel={resetPointerState}
					>
						{activeItem ? (
							<img
								key={activeItem.id}
								src={activeItem.image_url}
								alt={activeItem.alt}
								width={1600}
								height={1200}
								className="max-h-[min(72vh,calc(100dvh-14rem))] w-auto max-w-full object-contain select-none"
							/>
						) : (
							<div className="grid place-items-center gap-2 px-6 py-12 text-center text-sm text-white/72">
								<ImageSquareIcon className="size-6" aria-hidden="true" />
								<p>No image selected.</p>
							</div>
						)}

						{canNavigate ? (
							<>
								<Button
									type="button"
									variant="outline"
									size="icon-lg"
									className="absolute top-1/2 left-3 hidden -translate-y-1/2 border-white/20 bg-black/45 text-white hover:bg-black/60 hover:text-white focus-visible:border-white/60 md:inline-flex"
									onClick={showPrevious}
									aria-label="Show previous image"
									icon={<ArrowLeftIcon className="size-4" aria-hidden="true" />}
								/>
								<Button
									type="button"
									variant="outline"
									size="icon-lg"
									className="absolute top-1/2 right-3 hidden -translate-y-1/2 border-white/20 bg-black/45 text-white hover:bg-black/60 hover:text-white focus-visible:border-white/60 md:inline-flex"
									onClick={showNext}
									aria-label="Show next image"
									icon={
										<ArrowRightIcon className="size-4" aria-hidden="true" />
									}
								/>
							</>
						) : null}
					</div>

					<div className="grid gap-2 border-t border-white/10 bg-zinc-950 px-4 py-3 text-white sm:grid-cols-[1fr_auto] sm:items-end">
						<div className="grid gap-1">
							<p className="text-sm font-medium">
								{activeCaption?.primary ?? "Attachment"}
							</p>
							<p className="text-xs text-white/70">
								{activeCaption?.secondary ?? "No metadata"}
							</p>
						</div>
						<div className="flex items-center justify-between gap-2 text-xs text-white/70 sm:justify-end">
							{canNavigate ? (
								<p className="md:hidden">Swipe to browse</p>
							) : (
								<span />
							)}
							<p className="font-mono tabular-nums">
								{activeCaption?.indexLabel ?? "0 / 0"}
							</p>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
