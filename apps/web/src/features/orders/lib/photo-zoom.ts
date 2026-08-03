export interface Point {
	x: number;
	y: number;
}

export interface Size {
	height: number;
	width: number;
}

/**
 * Rendered as `transform: translate(offsetX px, offsetY px) scale(scale)` on a box whose
 * transform-origin is its own centre. In that order the offsets stay in unscaled screen
 * pixels measured from the stage centre, so dragging a finger 40px shifts the photo 40px
 * at 1x and at 5x alike.
 */
export interface ZoomTransform {
	offsetX: number;
	offsetY: number;
	scale: number;
}

export const MIN_SCALE = 1;

/**
 * A 2560px capture on a counter phone already runs out of source pixels around 2.3x, so this
 * is deliberate headroom past native detail: it lets the operator put a single torn thread
 * under his finger while the customer watches, not resolve anything new.
 */
export const MAX_SCALE = 5;

export const DOUBLE_TAP_SCALE = 2.5;

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

const clampAxis = (value: number, limit: number) =>
	limit === 0 ? 0 : clamp(value, -limit, limit);

export const resetTransform = (): ZoomTransform => ({
	offsetX: 0,
	offsetY: 0,
	scale: MIN_SCALE,
});

export const toCssTransform = ({ offsetX, offsetY, scale }: ZoomTransform) =>
	`translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

/** The box `object-contain` paints the photo into, before any zoom. */
export const fittedSize = (viewport: Size, natural: Size): Size => {
	const ratio = Math.min(
		viewport.width / natural.width,
		viewport.height / natural.height,
	);
	if (!Number.isFinite(ratio) || ratio <= 0) {
		return { height: 0, width: 0 };
	}
	return { height: natural.height * ratio, width: natural.width * ratio };
};

export const clampOffset = (
	scale: number,
	offset: Point,
	viewport: Size,
	fitted: Size,
): Point => {
	const limitX = Math.max(0, (fitted.width * scale - viewport.width) / 2);
	const limitY = Math.max(0, (fitted.height * scale - viewport.height) / 2);
	return {
		x: clampAxis(offset.x, limitX),
		y: clampAxis(offset.y, limitY),
	};
};

/** `mid` is the pinch midpoint relative to the stage centre. */
export const pinchZoom = (
	prev: ZoomTransform,
	mid: Point,
	factor: number,
	viewport: Size,
	fitted: Size,
): ZoomTransform => {
	if (!Number.isFinite(factor) || factor <= 0) {
		return prev;
	}

	const scale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE);
	// Post-clamp ratio: at the zoom stops the photo must sit still under the fingers.
	const ratio = scale / prev.scale;
	const offset = clampOffset(
		scale,
		{
			x: mid.x - ratio * (mid.x - prev.offsetX),
			y: mid.y - ratio * (mid.y - prev.offsetY),
		},
		viewport,
		fitted,
	);

	return { offsetX: offset.x, offsetY: offset.y, scale };
};

export const panBy = (
	prev: ZoomTransform,
	dx: number,
	dy: number,
	viewport: Size,
	fitted: Size,
): ZoomTransform => {
	const offset = clampOffset(
		prev.scale,
		{ x: prev.offsetX + dx, y: prev.offsetY + dy },
		viewport,
		fitted,
	);
	return { offsetX: offset.x, offsetY: offset.y, scale: prev.scale };
};

export const doubleTapZoom = (
	prev: ZoomTransform,
	tap: Point,
	viewport: Size,
	fitted: Size,
): ZoomTransform => {
	if (prev.scale > MIN_SCALE) {
		return resetTransform();
	}
	return pinchZoom(prev, tap, DOUBLE_TAP_SCALE / prev.scale, viewport, fitted);
};
