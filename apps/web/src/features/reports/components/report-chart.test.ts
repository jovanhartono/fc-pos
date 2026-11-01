import { describe, expect, it } from "bun:test";
import { axisTicks } from "@/features/reports/components/report-chart";

describe("x axis labels", () => {
	const days = Array.from(
		{ length: 30 },
		(_, i) => `2026-10-${String(i + 2).padStart(2, "0")}`,
	);
	const shown = (labels: string[], isDaily: boolean, slot: number) =>
		axisTicks(labels, isDaily, slot).map(({ label }) => label);

	it("labels Mondays on a daily chart", () => {
		// 5, 12, 19 and 26 Oct 2026 are Mondays.
		expect(shown(days, true, 30)).toEqual([
			"2026-10-05",
			"2026-10-12",
			"2026-10-19",
			"2026-10-26",
		]);
	});

	it("drops every other label on a phone so none touch", () => {
		// 5px a day makes a week 35px, closer than the 44px a label needs.
		expect(shown(days, true, 5)).toEqual(["2026-10-05", "2026-10-19"]);
	});

	it("names the first day when the range holds no Monday", () => {
		// Wed 28 Oct to Sun 1 Nov 2026.
		const week = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"];
		expect(shown(week, true, 60)).toEqual(["2026-10-28"]);
	});

	it("labels every week", () => {
		expect(shown(["2026-41", "2026-42"], false, 60)).toHaveLength(2);
	});
});
