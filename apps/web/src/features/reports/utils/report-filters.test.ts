import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import {
	toReportFilters,
	withPresetRange,
	withSavedReportFilters,
} from "@/features/reports/utils/report-filters";

// Mid-morning in Jakarta on the given day.
const onDay = (date: string) => setSystemTime(new Date(`${date}T03:00:00Z`));

afterEach(() => setSystemTime());

describe("toReportFilters", () => {
	it("keeps a tapped preset by name and drops its dates", () => {
		expect(
			toReportFilters({
				preset: "thisMonth",
				from: "2026-09-01",
				to: "2026-09-24",
				store_id: 3,
				granularity: "week",
			}),
		).toEqual({ preset: "thisMonth", store_id: 3, granularity: "week" });
	});

	it("keeps a custom range as its dates, even when they match a preset", () => {
		onDay("2026-09-30");
		expect(toReportFilters({ from: "2026-09-01", to: "2026-09-30" })).toEqual({
			from: "2026-09-01",
			to: "2026-09-30",
			store_id: undefined,
			granularity: undefined,
		});
	});
});

describe("withPresetRange", () => {
	it("reads a preset against today, whatever dates the link carries", () => {
		onDay("2026-10-02");
		expect(
			withPresetRange({ preset: "7d", from: "2026-09-18", to: "2026-09-24" }),
		).toEqual({ preset: "7d", from: "2026-09-26", to: "2026-10-02" });
	});

	it("keeps This month on the 1st, when it shares Today's dates", () => {
		onDay("2026-10-01");
		expect(
			withPresetRange({
				preset: "thisMonth",
				from: "2026-09-01",
				to: "2026-09-30",
			}),
		).toEqual({ preset: "thisMonth", from: "2026-10-01", to: "2026-10-01" });
	});

	it("leaves a custom range alone", () => {
		const search = { from: "2026-08-03", to: "2026-08-17" };
		expect(withPresetRange(search)).toBe(search);
	});
});

describe("withSavedReportFilters", () => {
	it("fills a URL with no filters from what was saved", () => {
		expect(
			withSavedReportFilters({}, { preset: "thisMonth", store_id: 3 }),
		).toEqual({ preset: "thisMonth", store_id: 3 });
	});

	it("lets any filter in the URL win over the saved ones", () => {
		const search = { store_id: 5 };
		expect(
			withSavedReportFilters(search, { preset: "today", store_id: 3 }),
		).toBe(search);
	});

	it("restores nothing after Reset saved no filters", () => {
		expect(withSavedReportFilters({}, toReportFilters({}))).toEqual({});
	});

	it("changes nothing when nothing was saved", () => {
		const search = {};
		expect(withSavedReportFilters(search, undefined)).toBe(search);
	});
});
