import { describe, expect, it } from "bun:test";
import {
	clampOffset,
	DOUBLE_TAP_SCALE,
	doubleTapZoom,
	fittedSize,
	MAX_SCALE,
	MIN_SCALE,
	type Point,
	panBy,
	pinchZoom,
	resetTransform,
	toCssTransform,
	type ZoomTransform,
} from "./photo-zoom";

// Counter phone held upright, and a garment shot that letterboxes into it exactly —
// the only geometry where the photo has slack on both axes, so a clamp never hides a
// broken anchor.
const upright = { height: 800, width: 400 };
const uprightGarment = { height: 2000, width: 1000 };
const uprightFitted = fittedSize(upright, uprightGarment);

/** Which spot on the garment sits under a point on the glass, in unzoomed photo pixels. */
const spotUnderFinger = (transform: ZoomTransform, glass: Point): Point => ({
	x: (glass.x - transform.offsetX) / transform.scale,
	y: (glass.y - transform.offsetY) / transform.scale,
});

const expectSameSpot = (before: Point, after: Point) => {
	expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1e-9);
	expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1e-9);
};

describe("what the operator sees before touching anything", () => {
	it("letterboxes a landscape drop-off shot into an upright phone", () => {
		expect(fittedSize(upright, { height: 3000, width: 4000 })).toEqual({
			height: 300,
			width: 400,
		});
	});

	it("pillarboxes an upright garment shot into a landscape tablet", () => {
		expect(
			fittedSize({ height: 500, width: 900 }, { height: 400, width: 300 }),
		).toEqual({ height: 500, width: 375 });
	});

	it("measures nothing until the photo has come down over mobile data", () => {
		expect(fittedSize(upright, { height: 0, width: 0 })).toEqual({
			height: 0,
			width: 0,
		});
	});
});

describe("pinching into the tear", () => {
	it("leaves the spot the operator pinched under his fingers", () => {
		const pinch = { x: 60, y: -10 };
		const before = spotUnderFinger(resetTransform(), pinch);

		const zoomed = pinchZoom(
			resetTransform(),
			pinch,
			3,
			upright,
			uprightFitted,
		);

		expect(zoomed.scale).toBe(3);
		expectSameSpot(before, spotUnderFinger(zoomed, pinch));
	});

	it("keeps that spot anchored while he pinches back out to show the whole garment", () => {
		const deep = pinchZoom(
			resetTransform(),
			{ x: 60, y: -10 },
			4,
			upright,
			uprightFitted,
		);
		const pinchOut = { x: -20, y: 40 };
		const before = spotUnderFinger(deep, pinchOut);

		const wider = pinchZoom(deep, pinchOut, 0.5, upright, uprightFitted);

		expect(wider.scale).toBe(2);
		expectSameSpot(before, spotUnderFinger(wider, pinchOut));
	});

	it("never shrinks the photo below the fitted view", () => {
		const squeezed = pinchZoom(
			resetTransform(),
			{ x: 80, y: 120 },
			0.2,
			upright,
			uprightFitted,
		);

		expect(squeezed).toEqual({ offsetX: 0, offsetY: 0, scale: MIN_SCALE });
	});

	it("holds the photo still under the fingers once it hits the deepest zoom", () => {
		const deepest = panBy(
			pinchZoom(
				resetTransform(),
				{ x: 0, y: 0 },
				MAX_SCALE,
				upright,
				uprightFitted,
			),
			50,
			-30,
			upright,
			uprightFitted,
		);

		const pushed = pinchZoom(
			deepest,
			{ x: 80, y: 120 },
			3,
			upright,
			uprightFitted,
		);

		expect(pushed.scale).toBe(MAX_SCALE);
		expect(pushed.offsetX).toBe(deepest.offsetX);
		expect(pushed.offsetY).toBe(deepest.offsetY);
	});

	// What the lightbox actually runs per frame: the fingers spread and slide at once, so the
	// zoom is composed with a pan by the midpoint's own travel.
	it("carries the tear along with fingers that slide while they spread", () => {
		const from = { x: 40, y: -30 };
		const to = { x: 90, y: 10 };
		const start = resetTransform();
		const before = spotUnderFinger(start, from);

		const slid = panBy(
			pinchZoom(start, from, 2, upright, uprightFitted),
			to.x - from.x,
			to.y - from.y,
			upright,
			uprightFitted,
		);

		expect(slid.scale).toBe(2);
		expectSameSpot(before, spotUnderFinger(slid, to));
	});

	it("ignores the frame where both fingers land on the same pixel", () => {
		const zoomed = pinchZoom(
			resetTransform(),
			{ x: 10, y: 10 },
			2,
			upright,
			uprightFitted,
		);

		for (const factor of [Number.NaN, Number.POSITIVE_INFINITY, 0, -2]) {
			expect(
				pinchZoom(zoomed, { x: 10, y: 10 }, factor, upright, uprightFitted),
			).toEqual(zoomed);
		}
	});
});

describe("dragging a zoomed photo", () => {
	it("stops at the edge of an upright garment shot on a landscape screen", () => {
		const stage = { height: 500, width: 900 };
		const fitted = fittedSize(stage, { height: 400, width: 300 });
		const zoomed = pinchZoom(
			resetTransform(),
			{ x: 0, y: 0 },
			2,
			stage,
			fitted,
		);

		expect(panBy(zoomed, -5000, -5000, stage, fitted)).toEqual({
			offsetX: 0,
			offsetY: -250,
			scale: 2,
		});
		expect(panBy(zoomed, 5000, 5000, stage, fitted)).toEqual({
			offsetX: 0,
			offsetY: 250,
			scale: 2,
		});
	});

	it("stops at the edge of a landscape shot on an upright screen", () => {
		const stage = { height: 900, width: 400 };
		const fitted = fittedSize(stage, { height: 2000, width: 4000 });
		const zoomed = pinchZoom(
			resetTransform(),
			{ x: 0, y: 0 },
			3,
			stage,
			fitted,
		);

		expect(panBy(zoomed, -5000, -5000, stage, fitted)).toEqual({
			offsetX: -400,
			offsetY: 0,
			scale: 3,
		});
		expect(panBy(zoomed, 5000, 5000, stage, fitted)).toEqual({
			offsetX: 400,
			offsetY: 0,
			scale: 3,
		});
	});

	it("refuses to drag a photo the customer is seeing whole", () => {
		expect(panBy(resetTransform(), 200, -200, upright, uprightFitted)).toEqual({
			offsetX: 0,
			offsetY: 0,
			scale: MIN_SCALE,
		});
	});

	it("pins a photo narrower than the stage to the centre", () => {
		const stage = { height: 500, width: 900 };
		const fitted = fittedSize(stage, { height: 400, width: 300 });

		expect(clampOffset(1.2, { x: 40, y: 0 }, stage, fitted).x).toBe(0);
	});
});

describe("pinching back out after inspecting a corner", () => {
	it("pulls the photo back on screen instead of stranding it off the edge", () => {
		const cornered = panBy(
			pinchZoom(
				resetTransform(),
				{ x: 0, y: 0 },
				MAX_SCALE,
				upright,
				uprightFitted,
			),
			5000,
			5000,
			upright,
			uprightFitted,
		);
		const deepestCorner = clampOffset(
			MAX_SCALE,
			{ x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
			upright,
			uprightFitted,
		);
		expect(cornered).toEqual({
			offsetX: deepestCorner.x,
			offsetY: deepestCorner.y,
			scale: MAX_SCALE,
		});

		const halfwayScale = MAX_SCALE * 0.4;
		const halfway = pinchZoom(
			cornered,
			{ x: 0, y: 0 },
			0.4,
			upright,
			uprightFitted,
		);
		const halfwayCorner = clampOffset(
			halfwayScale,
			{ x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
			upright,
			uprightFitted,
		);
		expect(halfway).toEqual({
			offsetX: halfwayCorner.x,
			offsetY: halfwayCorner.y,
			scale: halfwayScale,
		});

		const fittedAgain = pinchZoom(
			halfway,
			{ x: 0, y: 0 },
			0.5,
			upright,
			uprightFitted,
		);
		expect(fittedAgain).toEqual(resetTransform());
	});
});

describe("double tap", () => {
	it("jumps to inspection depth on the spot the operator tapped", () => {
		const tap = { x: 60, y: -10 };
		const before = spotUnderFinger(resetTransform(), tap);

		const zoomed = doubleTapZoom(resetTransform(), tap, upright, uprightFitted);

		expect(zoomed.scale).toBe(DOUBLE_TAP_SCALE);
		// The constant itself has to magnify, or the double tap does nothing and the operator
		// is left arguing about a mark he cannot show.
		expect(zoomed.scale).toBeGreaterThan(MIN_SCALE);
		expectSameSpot(before, spotUnderFinger(zoomed, tap));
	});

	it("returns to the whole garment on the next double tap", () => {
		const zoomed = doubleTapZoom(
			resetTransform(),
			{ x: 60, y: -10 },
			upright,
			uprightFitted,
		);

		expect(
			doubleTapZoom(zoomed, { x: -80, y: 200 }, upright, uprightFitted),
		).toEqual(resetTransform());
	});
});

describe("css output", () => {
	it("translates before scaling, so a drag covers the same distance at every depth", () => {
		expect(toCssTransform({ offsetX: -90, offsetY: 15, scale: 2.5 })).toBe(
			"translate(-90px, 15px) scale(2.5)",
		);
	});
});
