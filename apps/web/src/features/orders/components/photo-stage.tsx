import { ArrowLeft02Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  clampOffset,
  doubleTapZoom,
  fittedSize,
  MIN_SCALE,
  panBy,
  pinchZoom,
  resetTransform,
  toCssTransform,
} from "@/features/orders/lib/photo-zoom";
import type {
  Point,
  Size,
  ZoomTransform,
} from "@/features/orders/lib/photo-zoom";
import { photoTileUrl } from "@/features/orders/utils/photo-tile";
import { useBlockEdgeSwipe } from "@/hooks/use-block-edge-swipe";
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

interface Swipe {
  axis: "x" | "y" | "none" | null;
  deltaX: number;
  deltaY: number;
  id: number | null;
  lastAt: number;
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
  items: PhotoStageItem[];
  /** Pull-down-to-close. Left off in capture review, where a stray pull would drop unsaved shots. */
  onDismiss?: () => void;
  /** 0 to 1 while pulling down, back to 0 on a spring-back, so the owner can fade its backdrop. */
  onDismissProgress?: (progress: number) => void;
  onIndexChange: (index: number) => void;
}

interface PhotoPageProps {
  contentRef?: React.Ref<HTMLDivElement>;
  hasFull: boolean;
  isSettled: boolean;
  item: PhotoStageItem;
  onSettle: (id: PhotoStageItem["id"], size: Size | null) => void;
  slot: -1 | 0 | 1;
  zoom?: string;
}

interface TilePlaceholderProps {
  url: string;
}

// The small copy already shown on the Order sits under the full photo, so a slow
// connection shows the shoe at once instead of a black screen.
const TilePlaceholder = ({ url }: TilePlaceholderProps) => {
  const tileUrl = photoTileUrl(url);
  if (tileUrl === url) {
    return null;
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full object-contain select-none"
      draggable={false}
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
      src={tileUrl}
    />
  );
};

// One page per photo, kept by id: the photo a swipe drags in is the same element
// once it's the current one, so it never reloads or flashes at the swap.
const PhotoPage = ({
  contentRef,
  hasFull,
  isSettled,
  item,
  onSettle,
  slot,
  zoom,
}: PhotoPageProps) => (
  <div
    aria-hidden={slot === 0 ? undefined : true}
    className="absolute inset-0 overflow-hidden"
    style={
      slot === 0
        ? undefined
        : {
            transform: `translateX(calc(${slot * 100}% + ${slot * PAGE_GAP}px))`,
          }
    }
  >
    <div
      className="relative h-full w-full"
      ref={contentRef}
      style={zoom ? { transform: zoom } : undefined}
    >
      {isSettled ? null : <TilePlaceholder url={item.image_url} />}
      {hasFull ? (
        <img
          alt={slot === 0 ? item.alt : ""}
          className="pointer-events-none relative h-full w-full object-contain select-none [-webkit-touch-callout:none]"
          decoding="async"
          draggable={false}
          onError={() => onSettle(item.id, null)}
          onLoad={(event) =>
            onSettle(item.id, {
              height: event.currentTarget.naturalHeight,
              width: event.currentTarget.naturalWidth,
            })
          }
          src={item.image_url}
        />
      ) : null}
    </div>
  </div>
);

/**
 * The photo staff and a Customer argue over: pinch onto a torn thread, swipe to the next.
 * Shared by the lightbox and capture review so a photo behaves the same before and after upload.
 */
export const PhotoStage = ({
  activeIndex,
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
    undefined
  );
  const naturalSizesRef = useRef(new Map<PhotoStageItem["id"], Size>());
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
  const [settledIds, setSettledIds] = useState<
    ReadonlySet<PhotoStageItem["id"]>
  >(() => new Set());

  const imageCount = items.length;
  const canNavigate = imageCount > 1;
  const activeItem = items[activeIndex];
  const activeId = activeItem?.id;
  const previousIndex = (activeIndex - 1 + imageCount) % imageCount;
  const nextIndex = (activeIndex + 1) % imageCount;

  const commitTransform = useEffectEvent((next: ZoomTransform) => {
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
  });

  // Every way to another photo drops the previous zoom, or the next opens inside
  // it. Done during render so the fitted photo is what first paints.
  const [openedIndex, setOpenedIndex] = useState(activeIndex);
  if (openedIndex !== activeIndex) {
    setOpenedIndex(activeIndex);
    setTransform(resetTransform());
  }
  const resetIndexRef = useRef(openedIndex);
  useLayoutEffect(() => {
    if (resetIndexRef.current === openedIndex) {
      return;
    }
    resetIndexRef.current = openedIndex;
    transformRef.current = resetTransform();
    lastTapRef.current = null;
    // Whatever changed the photo — the swipe's own slide ending, a Filmstrip tap, an
    // arrow key mid-slide — the track comes home in the frame the new photo paints.
    clearTimeout(settleTimerRef.current);
    settleTimerRef.current = undefined;
    if (trackRef.current) {
      trackRef.current.style.transition = "none";
      trackRef.current.style.transform = "";
    }
  }, [openedIndex]);

  const showPrevious = () => {
    if (canNavigate) {
      onIndexChange(previousIndex);
    }
  };

  const showNext = () => {
    if (canNavigate) {
      onIndexChange(nextIndex);
    }
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

  const handleSettle = (id: PhotoStageItem["id"], size: Size | null) => {
    if (size && size.width > 0 && size.height > 0) {
      naturalSizesRef.current.set(id, size);
    }
    setSettledIds((settled) =>
      settled.has(id) ? settled : new Set(settled).add(id)
    );
  };
  // On a slow connection the neighbours wait, so the photo just tapped isn't sharing it.
  const isActiveSettled = activeId !== undefined && settledIds.has(activeId);

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

    // Coalesced into one write per frame: a React render per pointermove drops frames on
    // the mid-range phones the counter uses.
    const applyTransform = (next: ZoomTransform) => {
      transformRef.current = next;
      if (frameRef.current !== 0) {
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        if (contentRef.current) {
          contentRef.current.style.transform = toCssTransform(
            transformRef.current
          );
        }
      });
    };

    const resetPointerState = () => {
      pointerStateRef.current = idleSwipe();
    };

    const moveTrack = (trackTransform: string, isSettling: boolean) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      track.style.transition = isSettling
        ? `transform ${SETTLE_MS}ms ease-out`
        : "none";
      track.style.transform = trackTransform;
    };

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
      const { activeId: id } = latestRef.current;
      const size =
        id === undefined ? undefined : naturalSizesRef.current.get(id);
      if (!size) {
        return null;
      }
      const fitted = fittedSize(stage.viewport, size);
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

    const cancelDrag = () => {
      const wasDragging = isDragging(pointerStateRef.current);
      resetPointerState();
      if (wasDragging) {
        moveTrack("", true);
        latestRef.current.onDismissProgress?.(0);
      }
    };

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
          false
        );
        latestRef.current.onDismissProgress?.(
          Math.min(pull / (stage.viewport.height * DISMISS_FADE_RATIO), 1)
        );
      });
    };

    // The turn a released swipe is sliding towards, run when the slide ends.
    let pendingTurn: (() => void) | undefined;
    const finishTurn = () => {
      // A Filmstrip tap or arrow key mid-slide already changed the photo and
      // cleared the timer; the slide's own turn must not land on top of it.
      const turn =
        settleTimerRef.current === undefined ? undefined : pendingTurn;
      pendingTurn = undefined;
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = undefined;
      turn?.();
    };

    const settleDrag = (stage: Stage | null, releasedAt: number) => {
      const swipe = pointerStateRef.current;
      resetPointerState();
      if (!stage) {
        moveTrack("", false);
        return;
      }
      // Pulled down to look, held still, then let go: that's a spring-back, not a
      // flick. A flick back the other way changes the mind and springs back too.
      const isStillMoving = releasedAt - swipe.lastAt < FLICK_WINDOW_MS;
      const commits = (travel: number, velocity: number, span: number) => {
        const flick =
          isStillMoving && Math.abs(velocity) > FLICK_VELOCITY
            ? Math.sign(velocity) * Math.sign(travel)
            : 0;
        return (
          flick >= 0 &&
          (Math.abs(travel) > span ||
            (flick > 0 && Math.abs(travel) >= FLICK_MIN_TRAVEL))
        );
      };
      if (swipe.axis === "y") {
        if (
          swipe.deltaY > 0 &&
          commits(
            swipe.deltaY,
            swipe.velocityY,
            stage.viewport.height * DISMISS_COMMIT_RATIO
          )
        ) {
          latestRef.current.onDismiss?.();
          return;
        }
        moveTrack("", true);
        latestRef.current.onDismissProgress?.(0);
        return;
      }
      if (
        !commits(
          swipe.deltaX,
          swipe.velocityX,
          stage.viewport.width * PAGE_COMMIT_RATIO
        )
      ) {
        moveTrack("", true);
        return;
      }
      const direction = swipe.deltaX < 0 ? -1 : 1;
      moveTrack(
        `translate3d(${direction * (stage.viewport.width + PAGE_GAP)}px, 0, 0)`,
        true
      );
      pendingTurn =
        direction < 0
          ? () => latestRef.current.showNext()
          : () => latestRef.current.showPrevious();
      settleTimerRef.current = setTimeout(finishTurn, SETTLE_MS);
    };

    const handleDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest("button")) {
        return;
      }
      // Flicking through a batch: the next touch lands mid-slide, so the turn
      // finishes now rather than swallowing the new swipe.
      if (pendingTurn) {
        finishTurn();
      }
      if (pointers.size === 0) {
        gesture.stage = measureStage();
        gesture.pinched = false;
        gesture.startX = event.clientX;
        gesture.startY = event.clientY;
      }
      const { stage } = gesture;
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
        fitted
      );
      applyTransform(
        panBy(
          zoomed,
          geometry.mid.x - gesture.pinchMid.x,
          geometry.mid.y - gesture.pinchMid.y,
          stage.viewport,
          fitted
        )
      );
      gesture.pinchDist = geometry.dist;
      gesture.pinchMid = geometry.mid;
    };

    const handleMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      const { stage } = gesture;
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
            fitted
          )
        );
        return;
      }

      const swipe = pointerStateRef.current;
      if (swipe.id !== event.pointerId) {
        return;
      }
      const elapsed = Math.max(event.timeStamp - swipe.lastAt, MIN_SAMPLE_MS);
      const deltaX = event.clientX - swipe.startX;
      const deltaY = event.clientY - swipe.startY;
      swipe.velocityX = (deltaX - swipe.deltaX) / elapsed;
      swipe.velocityY = (deltaY - swipe.deltaY) / elapsed;
      swipe.deltaX = deltaX;
      swipe.deltaY = deltaY;
      swipe.lastAt = event.timeStamp;

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
        event.clientY - gesture.startY
      );
      if (travelled > TAP_SLOP) {
        lastTapRef.current = null;
        resetPointerState();
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
      resetPointerState();
      if (!isDoubleTap) {
        return;
      }

      lastTapRef.current = null;
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
          fitted
        )
      );
    };

    const dropPointer = (event: PointerEvent, tapEligible: boolean) => {
      if (!pointers.delete(event.pointerId)) {
        return;
      }
      const { stage } = gesture;
      const { pinched } = gesture;

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
      // A nudge that started turning the page is a drag, so it can't be the
      // first half of a double-tap zoom.
      if (isDragging(pointerStateRef.current)) {
        lastTapRef.current = null;
        settleDrag(stage, event.timeStamp);
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
          fitted
        )
      );
      // A wheel burst has no finger to lift, so nothing else would ever commit it.
      clearTimeout(wheelCommit);
      wheelCommit = setTimeout(
        () => commitTransform(transformRef.current),
        WHEEL_COMMIT_DELAY_MS
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
      pendingTurn = undefined;
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
  }, [surfaceNode]);

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
          "input, textarea, [contenteditable]"
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
      const { current } = transformRef;
      const rect = stageRef.current?.getBoundingClientRect();
      const id = latestRef.current.activeId;
      const size =
        id === undefined ? undefined : naturalSizesRef.current.get(id);
      if (current.scale === MIN_SCALE || !rect || !size) {
        return;
      }
      const viewport = { height: rect.height, width: rect.width };
      const offset = clampOffset(
        current.scale,
        { x: current.offsetX, y: current.offsetY },
        viewport,
        fittedSize(viewport, size)
      );
      commitTransform({
        offsetX: offset.x,
        offsetY: offset.y,
        scale: current.scale,
      });
    });
    observer.observe(surfaceNode);
    return () => observer.disconnect();
  }, [surfaceNode]);

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 [touch-action:none] items-center justify-center",
        // Only from the breakpoint the arrows appear at — a phone gives the whole
        // width to the photo and turns pages with a swipe.
        canNavigate && "md:px-14"
      )}
      ref={setSurfaceNode}
    >
      {activeItem ? (
        // Sideways clipping keeps the neighbours out of view on an iPad; a pulled
        // photo still floats over the toolbar like iOS.
        <div className="relative h-full w-full overflow-x-clip" ref={stageRef}>
          <div className="relative h-full w-full" ref={trackRef}>
            {canNavigate ? (
              <PhotoPage
                hasFull={
                  isActiveSettled || settledIds.has(items[previousIndex].id)
                }
                isSettled={settledIds.has(items[previousIndex].id)}
                item={items[previousIndex]}
                // With two photos the same one sits on both sides.
                key={
                  previousIndex === nextIndex
                    ? `${items[previousIndex].id}-before`
                    : items[previousIndex].id
                }
                onSettle={handleSettle}
                slot={-1}
              />
            ) : null}
            <PhotoPage
              contentRef={contentRef}
              hasFull
              isSettled={settledIds.has(activeItem.id)}
              item={activeItem}
              key={activeItem.id}
              onSettle={handleSettle}
              slot={0}
              zoom={toCssTransform(transform)}
            />
            {canNavigate ? (
              <PhotoPage
                hasFull={isActiveSettled || settledIds.has(items[nextIndex].id)}
                isSettled={settledIds.has(items[nextIndex].id)}
                item={items[nextIndex]}
                key={items[nextIndex].id}
                onSettle={handleSettle}
                slot={1}
              />
            ) : null}
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
    </div>
  );
};
