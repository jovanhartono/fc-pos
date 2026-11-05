import { ArrowLeft02Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import { useBlockEdgeSwipe } from "@/hooks/useBlockEdgeSwipe";
import { cn } from "@/lib/utils";

const DRAG_LOCK_SLOP = 10;
const PAGE_GAP = 16;
const PAGE_COMMIT_RATIO = 0.3;
const DISMISS_COMMIT_RATIO = 0.2;
const DISMISS_FADE_RATIO = 0.4;
const DISMISS_MIN_SCALE = 0.75;
// px per ms: a quick flick turns the page or closes even when it travels only a little.
const FLICK_VELOCITY = 0.4;
const FLICK_MIN_TRAVEL = 40;
const FLICK_WINDOW_MS = 80;
// Phones batch touch moves a millisecond apart; timing those alone reads as a huge speed.
const MIN_SAMPLE_MS = 8;
const SETTLE_MS = 220;
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

/** One finger at 1x, locked to turning the page (`x`) or pulling down to close (`y`). */
interface Swipe {
	axis: "x" | "y" | "none" | null;
	deltaX: number;
	deltaY: number;
	id: number | null;
	lastAt: number;
	lastX: number;
	lastY: number;
	startX: number;
	startY: number;
	velocityX: number;
	velocityY: number;
}

const idleSwipe = (): Swipe => ({
	axis: null,
	deltaX: 0,
	deltaY: 0,
	id: null,
	lastAt: 0,
	lastX: 0,
	lastY: 0,
	startX: 0,
	startY: 0,
	velocityX: 0,
	velocityY: 0,
});

export interface PhotoStageItem {
	alt: string;
	id: number | string;
	image_url: string;
}

interface PhotoStageProps {
	activeIndex: number;
	/** Anything interactive here must be a real `<button>`: the surface checks for one before claiming a touch. */
	children?: React.ReactNode;
	className?: string;
	items: PhotoStageItem[];
	/** Pull-down-to-close. Left off in capture review, where a stray pull would drop unsaved shots. */
	onDismiss?: () => void;
	/** 0 to 1 while pulling down, back to 0 on a spring-back, so the owner can fade its backdrop. */
	onDismissProgress?: (progress: number) => void;
	onIndexChange: (index: number) => void;
}

interface NeighbourPhotoProps {
	item: PhotoStageItem;
	side: "previous" | "next";
}

/** The photo either side, parked off-stage so a swipe drags it into view. */
const NeighbourPhoto = ({ item, side }: NeighbourPhotoProps) => (
	<img
		alt=""
		aria-hidden="true"
		className="pointer-events-none absolute inset-y-0 h-full w-full object-contain select-none"
		draggable={false}
		src={item.image_url}
		style={{
			[side === "previous" ? "right" : "left"]: `calc(100% + ${PAGE_GAP}px)`,
		}}
	/>
);

/**
 * The photo staff and a Customer argue over: pinch onto a torn thread, swipe to the next.
 * Shared by the lightbox and capture review so a photo behaves the same before and after upload.
 */
export const PhotoStage = ({
	activeIndex,
	children,
	className,
	items,
	onDismiss,
	onDismissProgress,
	onIndexChange,
}: PhotoStageProps) => {
	const [transform, setTransform] = useState<ZoomTransform>(resetTransform);
	const transformRef = useRef(transform);
	const frameRef = useRef(0);
	// The popup mounts a commit after `open` flips, so a ref was still null in the
	// effect and pinch was dead on every freshly opened lightbox.
	const [surfaceNode, setSurfaceNode] = useState<HTMLDivElement | null>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
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
	const pointerStateRef = useRef<Swipe>(idleSwipe());

	const imageCount = items.length;
	const canNavigate = imageCount > 1;
	const activeItem = items[activeIndex];
	const activeId = activeItem?.id;
	const previousIndex = (activeIndex - 1 + imageCount) % imageCount;
	const nextIndex = (activeIndex + 1) % imageCount;
	const previousItem = canNavigate ? items[previousIndex] : undefined;
	const nextItem = canNavigate ? items[nextIndex] : undefined;

	const commitTransform = useCallback((next: ZoomTransform) => {
		transformRef.current = next;
		if (frameRef.current !== 0) {
			cancelAnimationFrame(frameRef.current);
			frameRef.current = 0;
		}
		// React skips a style write matching its last render, but a pinch may have
		// changed the node; without this the next photo opens inside the old zoom.
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

	// Every way to another photo drops the previous zoom, or the next opens inside
	// it. Done during render so the fitted photo is what first paints.
	const [zoomedIndex, setZoomedIndex] = useState(activeIndex);
	if (zoomedIndex !== activeIndex) {
		setZoomedIndex(activeIndex);
		transformRef.current = resetTransform();
		setTransform(transformRef.current);
		lastTapRef.current = null;
	}

	// An arrow pressed while a swipe is still sliding would skip a photo.
	const isTurning = () => settleTimerRef.current !== undefined;

	const showPrevious = () => {
		if (!canNavigate || isTurning()) {
			return;
		}
		onIndexChange(previousIndex);
	};

	const showNext = () => {
		if (!canNavigate || isTurning()) {
			return;
		}
		onIndexChange(nextIndex);
	};

	// Listeners read the current photo from here: as effect deps they re-attached on
	// every photo change, mid-gesture, under the fingers of whoever was pinching.
	const latestRef = useRef({
		activeId,
		canNavigate,
		onDismiss,
		onDismissProgress,
		showNext,
		showPrevious,
	});
	useEffect(() => {
		latestRef.current = {
			activeId,
			canNavigate,
			onDismiss,
			onDismissProgress,
			showNext,
			showPrevious,
		};
	});

	const resetPointerState = useCallback(() => {
		pointerStateRef.current = idleSwipe();
	}, []);

	const moveTrack = useCallback((transform: string, isSettling: boolean) => {
		const track = trackRef.current;
		if (!track) {
			return;
		}
		track.style.transition = isSettling
			? `transform ${SETTLE_MS}ms ease-out`
			: "none";
		track.style.transform = transform;
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

		const isDragging = (swipe: Swipe) =>
			swipe.axis === "x" || swipe.axis === "y";

		// A finger lifted short of turning the page or closing: the photo springs back.
		const cancelDrag = () => {
			const wasDragging = isDragging(pointerStateRef.current);
			resetPointerState();
			if (wasDragging) {
				moveTrack("", true);
				latestRef.current.onDismissProgress?.(0);
			}
		};

		// One write per frame, like the zoom: phones report touch moves faster than they paint.
		let dragFrame = 0;
		const paintDrag = (stage: Stage) => {
			if (dragFrame !== 0) {
				return;
			}
			dragFrame = requestAnimationFrame(() => {
				dragFrame = 0;
				const swipe = pointerStateRef.current;
				if (swipe.axis === "x") {
					moveTrack(`translate3d(${swipe.deltaX}px, 0, 0)`, false);
					return;
				}
				if (swipe.axis !== "y") {
					return;
				}
				const pull = Math.max(0, swipe.deltaY);
				const shrink =
					Math.min(pull / stage.viewport.height, 1) * (1 - DISMISS_MIN_SCALE);
				moveTrack(
					`translate3d(${swipe.deltaX}px, ${pull}px, 0) scale(${1 - shrink})`,
					false,
				);
				latestRef.current.onDismissProgress?.(
					Math.min(pull / (stage.viewport.height * DISMISS_FADE_RATIO), 1),
				);
			});
		};

		const settleDrag = (stage: Stage | null, releasedAt: number) => {
			const swipe = pointerStateRef.current;
			if (!(stage && isDragging(swipe))) {
				resetPointerState();
				return;
			}
			// Pulled down to look, held still, then let go: that's a spring-back, not a flick.
			const isStillMoving = releasedAt - swipe.lastAt < FLICK_WINDOW_MS;
			const isFlick = (velocity: number, travel: number) =>
				isStillMoving &&
				Math.abs(travel) >= FLICK_MIN_TRAVEL &&
				Math.abs(velocity) > FLICK_VELOCITY &&
				Math.sign(velocity) === Math.sign(travel);
			if (swipe.axis === "y") {
				if (
					(swipe.deltaY > 0 && isFlick(swipe.velocityY, swipe.deltaY)) ||
					swipe.deltaY > stage.viewport.height * DISMISS_COMMIT_RATIO
				) {
					resetPointerState();
					latestRef.current.onDismiss?.();
					return;
				}
				cancelDrag();
				return;
			}
			if (
				!isFlick(swipe.velocityX, swipe.deltaX) &&
				Math.abs(swipe.deltaX) < stage.viewport.width * PAGE_COMMIT_RATIO
			) {
				cancelDrag();
				return;
			}
			resetPointerState();
			const direction = swipe.deltaX < 0 ? -1 : 1;
			moveTrack(
				`translate3d(${direction * (stage.viewport.width + PAGE_GAP)}px, 0, 0)`,
				true,
			);
			settleTimerRef.current = setTimeout(() => {
				settleTimerRef.current = undefined;
				// The neighbour becomes the current photo in the same frame the track
				// snaps home, so the swap never shows.
				flushSync(() => {
					if (direction < 0) {
						latestRef.current.showNext();
					} else {
						latestRef.current.showPrevious();
					}
				});
				moveTrack("", false);
			}, SETTLE_MS);
		};

		const handleDown = (event: PointerEvent) => {
			if (
				settleTimerRef.current !== undefined ||
				(event.target as Element | null)?.closest("button")
			) {
				return;
			}
			// A pinch must stay inside the stage, even one started mid-pull.
			stageRef.current?.style.removeProperty("overflow");
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
				cancelDrag();
				rebasePinch(stage);
				return;
			}
			if (transformRef.current.scale > MIN_SCALE) {
				return;
			}
			const { canNavigate: canTurn, onDismiss: dismiss } = latestRef.current;
			if (!(canTurn || dismiss) || event.pointerType === "mouse") {
				return;
			}
			pointerStateRef.current = {
				...idleSwipe(),
				id: event.pointerId,
				lastAt: event.timeStamp,
				lastX: event.clientX,
				lastY: event.clientY,
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
			const elapsed = Math.max(event.timeStamp - swipe.lastAt, MIN_SAMPLE_MS);
			swipe.velocityX = (event.clientX - swipe.lastX) / elapsed;
			swipe.velocityY = (event.clientY - swipe.lastY) / elapsed;
			swipe.lastAt = event.timeStamp;
			swipe.lastX = event.clientX;
			swipe.lastY = event.clientY;
			swipe.deltaX = event.clientX - swipe.startX;
			swipe.deltaY = event.clientY - swipe.startY;

			if (swipe.axis === null) {
				if (Math.hypot(swipe.deltaX, swipe.deltaY) < DRAG_LOCK_SLOP) {
					return;
				}
				const { canNavigate: canTurn, onDismiss: dismiss } = latestRef.current;
				if (Math.abs(swipe.deltaX) > Math.abs(swipe.deltaY)) {
					swipe.axis = canTurn ? "x" : "none";
				} else {
					swipe.axis = swipe.deltaY > 0 && dismiss ? "y" : "none";
				}
				// The pulled photo floats over the toolbar like iOS instead of being cut
				// off; sideways clipping stays so the neighbours never peek in on an iPad.
				if (swipe.axis === "y" && stageRef.current) {
					stageRef.current.style.overflow = "clip visible";
				}
			}
			if (swipe.axis === "none") {
				return;
			}
			event.preventDefault();
			paintDrag(stage);
		};

		const handleTap = (event: PointerEvent, stage: Stage | null) => {
			const travelled = Math.hypot(
				event.clientX - gesture.startX,
				event.clientY - gesture.startY,
			);
			// A nudge that started turning the page is a drag, so it can't be the first
			// half of a double-tap zoom.
			const isDrag =
				travelled > TAP_SLOP || pointerStateRef.current.axis !== null;
			const at = Date.now();
			const firstTap = isDrag ? null : lastTapRef.current;
			lastTapRef.current = isDrag
				? null
				: { at, x: event.clientX, y: event.clientY };
			const isDoubleTap =
				firstTap !== null &&
				at - firstTap.at <= DOUBLE_TAP_WINDOW_MS &&
				Math.hypot(event.clientX - firstTap.x, event.clientY - firstTap.y) <=
					TAP_SLOP;
			if (!isDoubleTap) {
				settleDrag(stage, event.timeStamp);
				return;
			}

			lastTapRef.current = null;
			cancelDrag();
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
				cancelDrag();
				return;
			}
			handleTap(event, stage);
		};

		const handleUp = (event: PointerEvent) => dropPointer(event, true);
		// A stolen touch — Control Centre swipe, incoming call — drops the finger but keeps
		// the place on the tear.
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
			cancelAnimationFrame(dragFrame);
			clearTimeout(settleTimerRef.current);
			settleTimerRef.current = undefined;
			moveTrack("", false);
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
	}, [
		applyTransform,
		commitTransform,
		moveTrack,
		resetPointerState,
		surfaceNode,
	]);

	// A mouse can't swipe, so on a counter PC the arrow keys are the way through a
	// batch. On the document since the surface can't take focus; text fields are
	// exempt so typing the capture note never changes the photo.
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

	useBlockEdgeSwipe(surfaceNode);

	// Turning the phone to show the Customer resizes the stage under a zoomed photo, and the
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
				// width to the photo and turns pages with a swipe.
				canNavigate && "md:px-14",
				className,
			)}
			ref={setSurfaceNode}
		>
			{activeItem ? (
				<div className="relative h-full w-full overflow-hidden" ref={stageRef}>
					<div className="relative h-full w-full" ref={trackRef}>
						{previousItem ? (
							<NeighbourPhoto item={previousItem} side="previous" />
						) : null}
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
						{nextItem ? <NeighbourPhoto item={nextItem} side="next" /> : null}
					</div>
				</div>
			) : null}

			{canNavigate ? (
				<>
					<Button
						aria-label="Show previous photo"
						className="absolute top-1/2 left-3 z-10 hidden size-11 -translate-y-1/2 bg-black/45 text-white hover:bg-black/60 hover:text-white active:-translate-y-1/2! md:inline-flex"
						icon={
							<HugeiconsIcon
								icon={ArrowLeft02Icon}
								className="size-5"
								aria-hidden="true"
							/>
						}
						onClick={showPrevious}
						size="icon"
						type="button"
						variant="outline"
					/>
					<Button
						aria-label="Show next photo"
						className="absolute top-1/2 right-3 z-10 hidden size-11 -translate-y-1/2 bg-black/45 text-white hover:bg-black/60 hover:text-white active:-translate-y-1/2! md:inline-flex"
						icon={
							<HugeiconsIcon
								icon={ArrowRight02Icon}
								className="size-5"
								aria-hidden="true"
							/>
						}
						onClick={showNext}
						size="icon"
						type="button"
						variant="outline"
					/>
				</>
			) : null}

			{children}
		</div>
	);
};
