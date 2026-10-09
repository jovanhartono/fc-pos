import { describe, expect, test } from "bun:test";
import { formatMoney } from "@/shared/money";
import {
	formatCampaignLimits,
	formatCampaignRedemption,
} from "./campaign-text";

describe("formatCampaignRedemption", () => {
	test("a listed Campaign with no Usage limit reads Listed", () => {
		expect(
			formatCampaignRedemption({
				redemption_mode: "listed",
				usage_limit: null,
			}),
		).toBe("Listed");
	});

	test("a listed Campaign with a Usage limit shows the limit", () => {
		expect(
			formatCampaignRedemption({ redemption_mode: "listed", usage_limit: 100 }),
		).toBe("Listed · limit 100");
	});

	test("a code Campaign reads Voucher", () => {
		expect(
			formatCampaignRedemption({ redemption_mode: "code", usage_limit: null }),
		).toBe("Voucher");
	});
});

describe("formatCampaignLimits", () => {
	test("a max and a minimum order share one line", () => {
		expect(
			formatCampaignLimits({
				max_discount: "30000",
				min_order_total: "120000",
			}),
		).toBe(`max ${formatMoney("30000")} · min ${formatMoney("120000")}`);
	});

	test("a max of 0 means no cap, so no max is shown", () => {
		expect(
			formatCampaignLimits({ max_discount: "0", min_order_total: "75000" }),
		).toBe(`min ${formatMoney("75000")}`);
	});

	test("no cap and no minimum leaves the line empty", () => {
		expect(
			formatCampaignLimits({ max_discount: null, min_order_total: "0" }),
		).toBe("");
	});
});
