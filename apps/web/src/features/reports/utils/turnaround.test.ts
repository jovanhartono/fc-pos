import { describe, expect, it } from "bun:test";
import {
	axisMaxHours,
	dayTickHours,
	jitter,
	longDuration,
	queuedShare,
	rowOrAll,
	shortDay,
	shortDuration,
} from "@/features/reports/utils/turnaround";

describe("durations", () => {
	it("switches from hours to days at 48 hours", () => {
		expect(shortDuration(22.4)).toBe("22h");
		expect(shortDuration(47.4)).toBe("47h");
		expect(shortDuration(165.6)).toBe("6,9d");
		expect(longDuration(22)).toBe("22 hours");
		expect(longDuration(48)).toBe("2,0 days");
		expect(longDuration(165.6)).toBe("6,9 days");
	});

	it("labels a day without a leading zero", () => {
		expect(shortDay("2026-10-09")).toBe("9 Oct");
	});
});

describe("axis", () => {
	it("is p99 x 1.25 rounded up to whole days, at least 3 days", () => {
		expect(axisMaxHours(240, [])).toBe(312);
		expect(axisMaxHours(10, [])).toBe(72);
	});

	it("falls back to the slowest Item without percentiles", () => {
		expect(axisMaxHours(null, [30, 200])).toBe(216);
		expect(axisMaxHours(null, [])).toBe(72);
	});

	it("steps gridlines by 1, 2 or 5 days with the span", () => {
		expect(dayTickHours(72)).toEqual([0, 24, 48, 72]);
		expect(dayTickHours(240)).toEqual([0, 48, 96, 144, 192, 240]);
		expect(dayTickHours(480)).toEqual([0, 120, 240, 360, 480]);
	});
});

describe("helpers", () => {
	it("jitters deterministically inside 0..1", () => {
		expect(jitter(7)).toBe(jitter(7));
		expect(jitter(7) >= 0 && jitter(7) < 1).toBe(true);
	});

	it("splits the bar in proportion", () => {
		expect(Math.round(queuedShare(96, 72))).toBe(57);
		expect(queuedShare(0, 0)).toBe(50);
	});

	it("falls back to the first row when the name is gone", () => {
		const rows = [{ name: "All Items" }, { name: "Shoes" }];
		expect(rowOrAll(rows, "Shoes").name).toBe("Shoes");
		expect(rowOrAll(rows, "Bags").name).toBe("All Items");
	});
});
