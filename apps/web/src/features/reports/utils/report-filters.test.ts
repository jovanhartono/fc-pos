import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import {
	toSavedReportFilters,
	withSavedReportFilters,
} from "@/features/reports/utils/report-filters";

// Mid-morning in Jakarta on the given day.
const onDay = (date: string) => setSystemTime(new Date(`${date}T03:00:00Z`));

afterEach(() => setSystemTime());

describe("toSavedReportFilters", () => {
	it("saves a preset range as the preset, not its dates", () => {
		onDay("2026-09-24");
		expect(
			toSavedReportFilters(
				{
					from: "2026-09-01",
					to: "2026-09-24",
					store_id: 3,
					granularity: "week",
				},
				undefined,
			),
		).toEqual({ preset: "thisMonth", storeId: 3, granularity: "week" });
	});

	it("saves a custom range as its dates", () => {
		onDay("2026-09-24");
		expect(
			toSavedReportFilters({ from: "2026-08-03", to: "2026-08-17" }, undefined),
		).toEqual({
			from: "2026-08-03",
			to: "2026-08-17",
			storeId: undefined,
			granularity: undefined,
		});
	});

	it("keeps This month restored on the 1st, when it has Today's dates", () => {
		onDay("2026-10-01");
		expect(
			toSavedReportFilters(
				{ from: "2026-10-01", to: "2026-10-01" },
				{ preset: "thisMonth" },
			).preset,
		).toBe("thisMonth");
	});

	it("saves the default range on the 30th as Last 30 days, not This month", () => {
		onDay("2026-09-30");
		expect(
			toSavedReportFilters({ from: "2026-09-01", to: "2026-09-30" }, undefined)
				.preset,
		).toBe("30d");
	});
});

describe("withSavedReportFilters", () => {
	it("re-reads a saved preset against today, so This month moves with the calendar", () => {
		onDay("2026-10-02");
		expect(
			withSavedReportFilters(
				{ tab: "financial" },
				{ preset: "thisMonth", storeId: 3 },
			),
		).toEqual({
			tab: "financial",
			from: "2026-10-01",
			to: "2026-10-02",
			store_id: 3,
			granularity: undefined,
		});
	});

	it("restores a custom range as the same dates", () => {
		onDay("2026-10-02");
		expect(
			withSavedReportFilters(
				{},
				{ from: "2026-08-03", to: "2026-08-17", granularity: "day" },
			),
		).toEqual({
			from: "2026-08-03",
			to: "2026-08-17",
			store_id: undefined,
			granularity: "day",
		});
	});

	it("leaves a URL that carries a range alone", () => {
		const search = { from: "2026-07-01", to: "2026-07-31" };
		expect(
			withSavedReportFilters(search, { preset: "today", storeId: 3 }),
		).toBe(search);
	});

	it("lets a Store in the URL win over the saved one", () => {
		onDay("2026-10-02");
		expect(
			withSavedReportFilters(
				{ store_id: "5" },
				{ preset: "today", storeId: 3 },
			),
		).toEqual({
			from: "2026-10-02",
			to: "2026-10-02",
			store_id: "5",
			granularity: undefined,
		});
	});

	it("changes nothing when nothing was saved", () => {
		const search = { tab: "quality" };
		expect(withSavedReportFilters(search, undefined)).toBe(search);
	});
});
