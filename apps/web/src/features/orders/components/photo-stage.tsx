import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	clampOffset,
	doubleTapZoom,
	fittedSize,
	MIN_SCALE,
	type Point,
	panBy,
	pinchZoom,
	resetTransform,
	type Size,
	toCssTransform,
	type ZoomTransform,
} from "@/features/orders/lib/photo-zoom";
import { cn } from "@/lib/utils";

const SWIPE_THRESHOLD = 56;
const DOUBLE_TAP_WINDOW_MS = 350;
const TAP_SLOP = 24;
const WHEEL_ZOOM_DIVISOR = 180;
const WHEEL_COMMIT_DELAY_MS = 120;
const SUPPRESSED_UA_GESTURES = [
	"contextmenu",
	"gesturestart",
	"gesturechange",
	"gestureend",
];

/** The untransformed photo box, measured once when the first finger lands. */
interface Stage {
	centreX: number;
	centreY: number;
	viewport: Size;
}

export interface PhotoStageItem {
	alt: string;
	id: number | string;
	image_url: string;
}

interface PhotoStageProps {
	activeIndex: number;
	/**
	 * Caller-specific overlay chrome, absolutely positioned inside the gesture surface
	 * alongside the navigation arrows. Anything interactive here must be a real
	 * `<button>` — that is what the surface tests for before claiming a touch as a
	 * gesture.
	 */
	children?: React.ReactNode;
	className?: string;
	items: PhotoStageItem[];
	onIndexChange: (index: number) => void;
}

/**
 * The photo surface an operator argues over with a customer: pinch or double-tap to put
 * a torn thread under a finger, drag to move around it, swipe to the next shot. Shared
 * by the saved-photo lightbox and the review step of the capture dialog so a shot behaves
 * the same before and after it is uploaded.
 */
export const PhotoStage = ({
	activeIndex,
	children,
	className,
	items,
	onIndexChange,
}: PhotoStageProps) => {
	const [transform, setTransform] = useState<ZoomTransform>(resetTransform);
	const transformRef = useRef(transform);
	const frameRef = useRef(0);
	// The dialog popup mounts in a later commit than the one that flips `open`, so a ref
	// read inside an effect is still null and the gesture listeners would never attach —
	// pinch was dead on every freshly opened lightbox. State makes the node a dependency.
	const [surfaceNode, setSurfaceNode] = useState<HTMLDivElement | null>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const naturalRef = useRef<{ id: number | string; size: Size } | null>(null);
	const pointersRef = useRef(new Map<number, Point>());
	const gestureRef = useRef({
		pinchDist: 0,
		pinchMid: { x: 0, y: 0 } as Point,
		pinched: false,
		stage: null as Stage | null,
		startX: 0,
		startY: 0,
	});
	const lastTapRef = useRef<{ at: number; x: number; y: number } | null>(null);
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

	const imageCount = items.length;
	const canNavigate = imageCount > 1;
	const activeItem = items[activeIndex];
	const activeId = activeItem?.id;

	const commitTransform = useCallback((next: ZoomTransform) => {
		transformRef.current = next;
		if (frameRef.current !== 0) {
			cancelAnimationFrame(frameRef.current);
			frameRef.current = 0;
		}
		// React skips the style write when the string matches its last render, but a pinch
		// may have already put a different one on the node — without this the photo stays
		// zoomed while state says fitted, and the next garment opens inside that zoom.
		if (contentRef.current) {
			contentRef.current.style.transform = toCssTransform(next);
		}
		setTransform(next);
	}, []);

	// Coalesced into one write per frame: a React render per pointermove drops frames on
	// the mid-range phones the counter uses.
	const applyTransform = useCallback((next: ZoomTransform) => {
		transformRef.current = next;
		if (frameRef.current !== 0) {
			return;
		}
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = 0;
			if (contentRef.current) {
				contentRef.current.style.transform = toCssTransform(
					transformRef.current,
				);
			}
		});
	}, []);

	// Every route into another photo — swipe, arrow key, desktop arrow, last-shot square — has
	// to drop the previous zoom, or the next garment opens inside it. Adjusted during render
	// rather than from an effect so the fitted photo is what first paints. A wheel zoom can
	// still leave one uncommitted frame on the node, which its own pending commit flushes.
	const [zoomedIndex, setZoomedIndex] = useState(activeIndex);
	if (zoomedIndex !== activeIndex) {
		setZoomedIndex(activeIndex);
		transformRef.current = resetTransform();
		setTransform(transformRef.current);
		lastTapRef.current = null;
	}

	const showPrevious = () => {
		if (!canNavigate) {
			return;
		}
		onIndexChange(activeIndex === 0 ? imageCount - 1 : activeIndex - 1);
	};

	const showNext = () => {
		if (!canNavigate) {
			return;
		}
		onIndexChange(activeIndex === imageCount - 1 ? 0 : activeIndex + 1);
	};

	// A swipe resolves on pointerup, long after render, so the listeners read the current
	// photo and navigation from here instead of taking them as effect dependencies. As deps
	// they tore down and re-attached all six listeners on every photo change — mid-gesture,
	// on the surface the operator still had fingers on.
	const latestRef = useRef({ activeId, canNavigate, showNext, showPrevious });
	useEffect(() => {
		latestRef.current = { activeId, canNavigate, showNext, showPrevious };
	});

	const resetPointerState = useCallback(() => {
		pointerStateRef.current = {
			deltaX: 0,
			deltaY: 0,
			id: null,
			startX: 0,
			startY: 0,
		};
	}, []);

	const handleImageLoad: React.ReactEventHandler<HTMLImageElement> = (
		event,
	) => {
		const { naturalHeight, naturalWidth } = event.currentTarget;
		if (activeId === undefined || naturalWidth === 0 || naturalHeight === 0) {
			return;
		}
		naturalRef.current = {
			id: activeId,
			size: { height: naturalHeight, width: naturalWidth },
		};
	};

	useEffect(() => {
		const surface = surfaceNode;
		if (!surface) {
			return;
		}

		const pointers = pointersRef.current;
		const gesture = gestureRef.current;
		// A dialog closed mid-touch can leave a finger behind; a fresh surface starts empty
		// so the next single tap is never mistaken for a pinch.
		pointers.clear();
		gesture.stage = null;
		gesture.pinched = false;

		const measureStage = (): Stage | null => {
			const rect = stageRef.current?.getBoundingClientRect();
			if (!rect || rect.width === 0 || rect.height === 0) {
				return null;
			}
			return {
				centreX: rect.left + rect.width / 2,
				centreY: rect.top + rect.height / 2,
				viewport: { height: rect.height, width: rect.width },
			};
		};

		const photoBox = (stage: Stage) => {
			const loaded = naturalRef.current;
			if (!loaded || loaded.id !== latestRef.current.activeId) {
				return null;
			}
			const fitted = fittedSize(stage.viewport, loaded.size);
			return fitted.width > 0 && fitted.height > 0 ? fitted : null;
		};

		const pinchGeometry = (stage: Stage) => {
			const [first, second] = [...pointers.values()];
			if (!(first && second)) {
				return null;
			}
			return {
				dist: Math.hypot(first.x - second.x, first.y - second.y),
				mid: {
					x: (first.x + second.x) / 2 - stage.centreX,
					y: (first.y + second.y) / 2 - stage.centreY,
				},
			};
		};

		// Every finger added or lifted re-baselines the pinch, otherwise the next frame
		// computes a huge delta and the photo snaps away from the spot under discussion.
		const rebasePinch = (stage: Stage | null) => {
			const geometry = stage ? pinchGeometry(stage) : null;
			gesture.pinchDist = geometry?.dist ?? 0;
			gesture.pinchMid = geometry?.mid ?? { x: 0, y: 0 };
		};

		const handleDown = (event: PointerEvent) => {
			if ((event.target as Element | null)?.closest("button")) {
				return;
			}
			if (pointers.size === 0) {
				gesture.stage = measureStage();
				gesture.pinched = false;
				gesture.startX = event.clientX;
				gesture.startY = event.clientY;
			}
			const stage = gesture.stage;
			if (!stage) {
				return;
			}
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

			if (pointers.size >= 2) {
				gesture.pinched = true;
				lastTapRef.current = null;
				resetPointerState();
				rebasePinch(stage);
				return;
			}
			if (transformRef.current.scale > MIN_SCALE) {
				return;
			}
			if (!latestRef.current.canNavigate || event.pointerType === "mouse") {
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

		const handlePinchMove = (event: PointerEvent, stage: Stage) => {
			event.preventDefault();
			const geometry = pinchGeometry(stage);
			const fitted = photoBox(stage);
			if (!(geometry && fitted) || gesture.pinchDist < 1 || geometry.dist < 1) {
				rebasePinch(stage);
				return;
			}
			const zoomed = pinchZoom(
				transformRef.current,
				gesture.pinchMid,
				geometry.dist / gesture.pinchDist,
				stage.viewport,
				fitted,
			);
			applyTransform(
				panBy(
					zoomed,
					geometry.mid.x - gesture.pinchMid.x,
					geometry.mid.y - gesture.pinchMid.y,
					stage.viewport,
					fitted,
				),
			);
			gesture.pinchDist = geometry.dist;
			gesture.pinchMid = geometry.mid;
		};

		const handleMove = (event: PointerEvent) => {
			const previous = pointers.get(event.pointerId);
			const stage = gesture.stage;
			if (!(previous && stage)) {
				return;
			}
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

			if (pointers.size >= 2) {
				handlePinchMove(event, stage);
				return;
			}

			if (transformRef.current.scale > MIN_SCALE) {
				const fitted = photoBox(stage);
				if (!fitted) {
					return;
				}
				event.preventDefault();
				applyTransform(
					panBy(
						transformRef.current,
						event.clientX - previous.x,
						event.clientY - previous.y,
						stage.viewport,
						fitted,
					),
				);
				return;
			}

			const swipe = pointerStateRef.current;
			if (swipe.id !== event.pointerId) {
				return;
			}
			swipe.deltaX = event.clientX - swipe.startX;
			swipe.deltaY = event.clientY - swipe.startY;
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
					latestRef.current.showNext();
				} else {
					latestRef.current.showPrevious();
				}
			}

			resetPointerState();
		};

		const handleTap = (event: PointerEvent, stage: Stage | null) => {
			const travelled = Math.hypot(
				event.clientX - gesture.startX,
				event.clientY - gesture.startY,
			);
			if (travelled > TAP_SLOP) {
				lastTapRef.current = null;
				commitSwipe();
				return;
			}

			const at = Date.now();
			const firstTap = lastTapRef.current;
			lastTapRef.current = { at, x: event.clientX, y: event.clientY };
			const isDoubleTap =
				firstTap !== null &&
				at - firstTap.at <= DOUBLE_TAP_WINDOW_MS &&
				Math.hypot(event.clientX - firstTap.x, event.clientY - firstTap.y) <=
					TAP_SLOP;
			if (!isDoubleTap) {
				commitSwipe();
				return;
			}

			lastTapRef.current = null;
			resetPointerState();
			const fitted = stage ? photoBox(stage) : null;
			if (!(stage && fitted)) {
				return;
			}
			commitTransform(
				doubleTapZoom(
					transformRef.current,
					{
						x: event.clientX - stage.centreX,
						y: event.clientY - stage.centreY,
					},
					stage.viewport,
					fitted,
				),
			);
		};

		const dropPointer = (event: PointerEvent, tapEligible: boolean) => {
			if (!pointers.delete(event.pointerId)) {
				return;
			}
			const stage = gesture.stage;
			const pinched = gesture.pinched;

			if (pointers.size >= 2) {
				rebasePinch(stage);
				return;
			}
			// The finger still down carries on as a pan from its own last position.
			if (pointers.size === 1) {
				gesture.pinchDist = 0;
				return;
			}

			gesture.stage = null;
			gesture.pinched = false;
			gesture.pinchDist = 0;
			commitTransform(transformRef.current);

			if (!tapEligible || pinched) {
				lastTapRef.current = null;
				resetPointerState();
				return;
			}
			handleTap(event, stage);
		};

		const handleUp = (event: PointerEvent) => dropPointer(event, true);
		// A stolen touch — Control Centre swipe, incoming call — drops the finger but keeps
		// the operator's place on the tear.
		const handleAbort = (event: PointerEvent) => dropPointer(event, false);

		let wheelCommit: ReturnType<typeof setTimeout> | undefined;
		const handleWheel = (event: WheelEvent) => {
			if (!event.ctrlKey) {
				return;
			}
			// Trackpad pinch arrives as ctrl+wheel; unprevented it zooms the whole admin.
			event.preventDefault();
			const stage = measureStage();
			const fitted = stage ? photoBox(stage) : null;
			if (!(stage && fitted)) {
				return;
			}
			applyTransform(
				pinchZoom(
					transformRef.current,
					{
						x: event.clientX - stage.centreX,
						y: event.clientY - stage.centreY,
					},
					Math.exp(-event.deltaY / WHEEL_ZOOM_DIVISOR),
					stage.viewport,
					fitted,
				),
			);
			// A wheel burst has no finger to lift, so nothing else would ever commit it.
			clearTimeout(wheelCommit);
			wheelCommit = setTimeout(
				() => commitTransform(transformRef.current),
				WHEEL_COMMIT_DELAY_MS,
			);
		};

		surface.addEventListener("pointerdown", handleDown, { passive: false });
		surface.addEventListener("pointermove", handleMove, { passive: false });
		surface.addEventListener("pointerup", handleUp, { passive: false });
		surface.addEventListener("pointercancel", handleAbort, { passive: false });
		surface.addEventListener("lostpointercapture", handleAbort, {
			passive: false,
		});
		surface.addEventListener("wheel", handleWheel, { passive: false });

		return () => {
			clearTimeout(wheelCommit);
			surface.removeEventListener("pointerdown", handleDown);
			surface.removeEventListener("pointermove", handleMove);
			surface.removeEventListener("pointerup", handleUp);
			surface.removeEventListener("pointercancel", handleAbort);
			surface.removeEventListener("lostpointercapture", handleAbort);
			surface.removeEventListener("wheel", handleWheel);
			// Re-attaching mid-gesture drops the fingers, so publish whatever the last frame
			// wrote to the node — otherwise state and the photo disagree from here on.
			commitTransform(transformRef.current);
		};
	}, [applyTransform, commitTransform, resetPointerState, surfaceNode]);

	// A mouse cannot swipe — a drag on the desk machine is a pan, never a page turn — so on
	// a counter PC the arrow keys and the arrows above are the only way through a batch.
	// Bound on the document rather than the surface because the surface is not focusable and
	// nothing would reach it; both callers are full-screen dialogs that trap focus, so this
	// never fires against the rest of the admin. Text fields are exempt or the note in the
	// capture dialog could not be edited without the photo changing under it.
	useEffect(() => {
		const owner = surfaceNode?.ownerDocument;
		if (!owner) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (!latestRef.current.canNavigate || event.altKey || event.metaKey) {
				return;
			}
			if (
				(event.target as Element | null)?.closest(
					"input, textarea, [contenteditable]",
				)
			) {
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				latestRef.current.showPrevious();
			} else if (event.key === "ArrowRight") {
				event.preventDefault();
				latestRef.current.showNext();
			}
		};

		owner.addEventListener("keydown", handleKeyDown);
		return () => owner.removeEventListener("keydown", handleKeyDown);
	}, [surfaceNode]);

	// The browser defaults that fight a pinch on the evidence: iOS Safari page-zooms on any
	// two-finger touch whatever touch-action says, and a long press pops "Save image" over the
	// photo. Scoped to this surface so the rest of the admin keeps accessibility zoom.
	useEffect(() => {
		if (!surfaceNode) {
			return;
		}
		const suppress = (event: Event) => event.preventDefault();
		for (const name of SUPPRESSED_UA_GESTURES) {
			surfaceNode.addEventListener(name, suppress, { passive: false });
		}
		return () => {
			for (const name of SUPPRESSED_UA_GESTURES) {
				surfaceNode.removeEventListener(name, suppress);
			}
		};
	}, [surfaceNode]);

	// Turning the phone to show the customer resizes the stage under a zoomed photo, and the
	// offsets it was panned to can now sit entirely outside it — a blank screen mid-dispute.
	useEffect(() => {
		if (!surfaceNode) {
			return;
		}
		const observer = new ResizeObserver(() => {
			const current = transformRef.current;
			const rect = stageRef.current?.getBoundingClientRect();
			const loaded = naturalRef.current;
			if (current.scale === MIN_SCALE || !rect || !loaded) {
				return;
			}
			const viewport = { height: rect.height, width: rect.width };
			const offset = clampOffset(
				current.scale,
				{ x: current.offsetX, y: current.offsetY },
				viewport,
				fittedSize(viewport, loaded.size),
			);
			commitTransform({
				offsetX: offset.x,
				offsetY: offset.y,
				scale: current.scale,
			});
		});
		observer.observe(surfaceNode);
		return () => observer.disconnect();
	}, [commitTransform, surfaceNode]);

	return (
		<div
			className={cn(
				"relative flex min-h-0 flex-1 items-center justify-center [touch-action:none]",
				// Only from the breakpoint the arrows appear at — a phone gives the whole
				// width to the garment and turns pages with a swipe.
				canNavigate && "md:px-14",
				className,
			)}
			ref={setSurfaceNode}
		>
			{activeItem ? (
				<div className="relative h-full w-full overflow-hidden" ref={stageRef}>
					<div
						className="h-full w-full"
						ref={contentRef}
						style={{ transform: toCssTransform(transform) }}
					>
						<img
							alt={activeItem.alt}
							className="pointer-events-none h-full w-full object-contain select-none [-webkit-touch-callout:none]"
							draggable={false}
							key={activeItem.id}
							onLoad={handleImageLoad}
							src={activeItem.image_url}
						/>
					</div>
				</div>
			) : null}

			{canNavigate ? (
				<>
					<Button
						aria-label="Show previous photo"
						className="absolute top-1/2 left-3 z-10 hidden size-11 -translate-y-1/2 border-white/20 bg-black/45 text-white hover:bg-black/60 hover:text-white focus-visible:border-white/60 active:-translate-y-1/2! md:inline-flex"
						icon={<ArrowLeftIcon className="size-5" aria-hidden="true" />}
						onClick={showPrevious}
						size="icon-lg"
						type="button"
						variant="outline"
					/>
					<Button
						aria-label="Show next photo"
						className="absolute top-1/2 right-3 z-10 hidden size-11 -translate-y-1/2 border-white/20 bg-black/45 text-white hover:bg-black/60 hover:text-white focus-visible:border-white/60 active:-translate-y-1/2! md:inline-flex"
						icon={<ArrowRightIcon className="size-5" aria-hidden="true" />}
						onClick={showNext}
						size="icon-lg"
						type="button"
						variant="outline"
					/>
				</>
			) : null}

			{children}
		</div>
	);
};
