import { describe, expect, test } from "bun:test";
import { filterEligibleCampaigns } from "./campaign-eligibility";

const buy4Get1 = {
	buy_quantity: 4,
	code: "B4G1",
	discount_type: "buy_n_get_m_free" as const,
	eligibleServices: [{ service_id: 21 }],
	free_quantity: 1,
	is_active: true,
	min_order_total: "0",
	stores: [],
};

describe("filterEligibleCampaigns", () => {
	test("hides buy 4 get 1 until five eligible Services are in the Cart", () => {
		const lines = (count: number) =>
			Array.from({ length: count }, () => ({ service_id: 21 }));

		expect(
			filterEligibleCampaigns([buy4Get1], {
				grossTotal: 300_000,
				lines: lines(3),
				storeId: 1,
			}),
		).toEqual([]);
		expect(
			filterEligibleCampaigns([buy4Get1], {
				grossTotal: 500_000,
				lines: lines(5),
				storeId: 1,
			}),
		).toEqual([buy4Get1]);
	});
});
