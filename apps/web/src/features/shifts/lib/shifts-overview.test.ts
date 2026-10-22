import { describe, expect, it } from "bun:test";
import type { ShiftsOverview } from "@/features/shifts/api";
import {
	buildStoreGroups,
	stepRange,
	summarizeGroups,
} from "@/features/shifts/lib/shifts-overview";

const TODAY = "2026-10-22";

describe("stepRange", () => {
	it("moves Last 30 days back by 30 days", () => {
		expect(stepRange({ from: "2026-09-23", to: TODAY }, -1, TODAY)).toEqual({
			from: "2026-08-24",
			to: "2026-09-22",
		});
	});

	it("keeps the length when stepping forward into today", () => {
		expect(
			stepRange({ from: "2026-09-20", to: "2026-10-19" }, 1, TODAY),
		).toEqual({ from: "2026-09-23", to: TODAY });
	});

	it("moves This month back to the whole of last month", () => {
		expect(stepRange({ from: "2026-10-01", to: TODAY }, -1, TODAY)).toEqual({
			from: "2026-09-01",
			to: "2026-09-30",
		});
	});

	it("moves Last month forward to this month so far", () => {
		expect(
			stepRange({ from: "2026-09-01", to: "2026-09-30" }, 1, TODAY),
		).toEqual({ from: "2026-10-01", to: TODAY });
	});

	it("moves This week back to the whole Monday week", () => {
		expect(stepRange({ from: "2026-10-19", to: TODAY }, -1, TODAY)).toEqual({
			from: "2026-10-12",
			to: "2026-10-18",
		});
	});

	it("moves This week back a week when the week starts on the 1st", () => {
		const today = "2026-06-03";
		expect(
			stepRange({ from: "2026-06-01", to: today }, -1, today, "thisWeek"),
		).toEqual({ from: "2026-05-25", to: "2026-05-31" });
	});

	it("moves Last 7 days back 7 days on the 7th of the month", () => {
		const today = "2026-10-07";
		expect(
			stepRange({ from: "2026-10-01", to: today }, -1, today, "7d"),
		).toEqual({ from: "2026-09-24", to: "2026-09-30" });
	});

	it("reads a stepped Monday week starting on the 1st as a week", () => {
		expect(
			stepRange({ from: "2026-06-01", to: "2026-06-07" }, -1, TODAY),
		).toEqual({ from: "2026-05-25", to: "2026-05-31" });
	});

	it("moves one day at a time", () => {
		expect(stepRange({ from: TODAY, to: TODAY }, -1, TODAY)).toEqual({
			from: "2026-10-21",
			to: "2026-10-21",
		});
	});
});

const KEMANG = { id: 1, name: "Fresclean Kemang", is_active: true };
const BSD = { id: 2, name: "Fresclean BSD", is_active: true };

const day = (user_id: number, store_id: number, date: string, shifts = 1) => ({
	day: date,
	forgotten: 0,
	minutes: 540,
	open: false,
	shifts,
	store_id,
	user_id,
});

// Rizky works Kemang and BSD; on the 13th he did both, which is one meal fee.
const overview: ShiftsOverview = {
	people: [
		{ id: 7, name: "Asep", role: "worker", store_ids: [1] },
		{ id: 9, name: "Rizky", role: "worker", store_ids: [1, 2] },
	],
	days: [
		day(7, 1, "2026-10-12"),
		day(9, 1, "2026-10-12", 2),
		day(9, 1, "2026-10-13"),
		day(9, 2, "2026-10-13"),
		day(9, 2, "2026-10-14"),
	],
};

describe("buildStoreGroups", () => {
	it("lists a two-Store person under each, with the other Store's days", () => {
		const [kemang, bsd] = buildStoreGroups(overview, [KEMANG, BSD], undefined);
		const rizky = kemang.rows.find((row) => row.person.id === 9);

		expect(kemang.rows.map((row) => row.person.name)).toEqual([
			"Asep",
			"Rizky",
		]);
		expect(bsd.rows.map((row) => row.person.name)).toEqual(["Rizky"]);
		expect(rizky?.days).toBe(2);
		expect(rizky?.shifts).toBe(3);
		expect(rizky?.elsewhere).toEqual([
			{ storeId: 2, storeName: "Fresclean BSD", days: 2 },
		]);
		expect(rizky?.daysAllStores).toBe(3);
	});

	it("counts a day at two Stores once in the totals", () => {
		const totals = summarizeGroups(
			buildStoreGroups(overview, [KEMANG, BSD], undefined),
		);

		expect(totals.days).toBe(4);
		expect(totals.people).toBe(2);
	});

	it("shows only the picked Store but still knows the other's days", () => {
		const groups = buildStoreGroups(overview, [KEMANG, BSD], 1);

		expect(groups.map((group) => group.store.id)).toEqual([1]);
		expect(summarizeGroups(groups).days).toBe(3);
		expect(groups[0].rows[1].elsewhere[0].days).toBe(2);
	});
});
