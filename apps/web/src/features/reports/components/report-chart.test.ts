import { describe, expect, it } from "bun:test";
import { axisTicks } from "@/features/reports/components/report-chart";

describe("x axis labels", () => {
	const days = Array.from(
		{ length: 30 },
		(_, i) => `2026-10-${String(i + 2).padStart(2, "0")}`,
	);
	const shown = (labels: string[], slot: number) =>
		axisTicks(labels, slot).map(({ label }) => label);

	it("labels every day when there's room", () => {
		const week = days.slice(0, 7);
		expect(shown(week, 60)).toEqual(week);
	});

	it("drops every other label until none touch", () => {
		// 12px a day: every 4th day is 48px apart, past the 44px a label needs.
		expect(shown(days, 12)).toEqual([
			"2026-10-02",
			"2026-10-06",
			"2026-10-10",
			"2026-10-14",
			"2026-10-18",
			"2026-10-22",
			"2026-10-26",
			"2026-10-30",
		]);
	});

	it("labels every week", () => {
		expect(shown(["2026-41", "2026-42"], 60)).toHaveLength(2);
	});
});
