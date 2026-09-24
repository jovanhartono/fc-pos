import { describe, expect, it } from "bun:test";
import {
	defaultRange,
	toSavedReportFilters,
	withSavedReportFilters,
} from "@/features/reports/utils/report-filters";
import type { RangePreset } from "@/shared/date-presets";

const september: RangePreset[] = [
	{ id: "today", label: "Today", from: "2026-09-24", to: "2026-09-24" },
	{
		id: "thisMonth",
		label: "This month",
		from: "2026-09-01",
		to: "2026-09-24",
	},
];

const october: RangePreset[] = [
	{ id: "today", label: "Today", from: "2026-10-02", to: "2026-10-02" },
	{
		id: "thisMonth",
		label: "This month",
		from: "2026-10-01",
		to: "2026-10-02",
	},
];

describe("toSavedReportFilters", () => {
	it("saves a preset range as the preset, not its dates", () => {
		expect(
			toSavedReportFilters(
				{
					from: "2026-09-01",
					to: "2026-09-24",
					store_id: 3,
					granularity: "week",
				},
				september,
			),
		).toEqual({
			range: { preset: "thisMonth" },
			storeId: 3,
			granularity: "week",
		});
	});

	it("saves a custom range as its dates", () => {
		expect(
			toSavedReportFilters({ from: "2026-08-03", to: "2026-08-17" }, september),
		).toEqual({
			range: { from: "2026-08-03", to: "2026-08-17" },
			storeId: undefined,
			granularity: undefined,
		});
	});
});

describe("withSavedReportFilters", () => {
	it("re-reads a saved preset against today, so This month moves with the calendar", () => {
		const saved = toSavedReportFilters(
			{ from: "2026-09-01", to: "2026-09-24", store_id: 3 },
			september,
		);

		expect(
			withSavedReportFilters({ tab: "financial" }, saved, october),
		).toEqual({
			tab: "financial",
			from: "2026-10-01",
			to: "2026-10-02",
			store_id: 3,
			granularity: undefined,
		});
	});

	it("restores a custom range as the same dates", () => {
		expect(
			withSavedReportFilters(
				{},
				{ range: { from: "2026-08-03", to: "2026-08-17" }, granularity: "day" },
				october,
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
			withSavedReportFilters(
				search,
				{ range: { preset: "today" }, storeId: 3 },
				october,
			),
		).toBe(search);
	});

	it("lets a Store in the URL win over the saved one", () => {
		expect(
			withSavedReportFilters(
				{ store_id: "5" },
				{ range: { preset: "today" }, storeId: 3 },
				october,
			),
		).toEqual({
			from: "2026-10-02",
			to: "2026-10-02",
			store_id: "5",
			granularity: undefined,
		});
	});

	it("falls back to the default range when a saved preset no longer exists", () => {
		expect(
			withSavedReportFilters(
				{},
				// @ts-expect-error a preset id retired after it was saved
				{ range: { preset: "fortnight" } },
				october,
			),
		).toEqual({
			...defaultRange(),
			store_id: undefined,
			granularity: undefined,
		});
	});

	it("changes nothing when nothing was saved", () => {
		const search = { tab: "quality" };
		expect(withSavedReportFilters(search, undefined, october)).toBe(search);
	});
});
