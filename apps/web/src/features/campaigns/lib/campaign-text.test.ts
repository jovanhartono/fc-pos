import { describe, expect, test } from "bun:test";
import { formatMoney } from "@/shared/money";
import {
	formatCampaignDiscount,
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

describe("formatCampaignDiscount", () => {
	test("a percentage with a max folds the max in", () => {
		expect(
			formatCampaignDiscount({
				discount_type: "percentage",
				discount_value: "10",
				max_discount: "30000",
				buy_quantity: null,
				free_quantity: null,
			}),
		).toBe(`10% · max ${formatMoney("30000")}`);
	});

	test("a percentage without a max is just the percentage", () => {
		expect(
			formatCampaignDiscount({
				discount_type: "percentage",
				discount_value: "10",
				max_discount: null,
				buy_quantity: null,
				free_quantity: null,
			}),
		).toBe("10%");
	});

	test("a fixed discount is the rupiah amount", () => {
		expect(
			formatCampaignDiscount({
				discount_type: "fixed",
				discount_value: "25000",
				max_discount: null,
				buy_quantity: null,
				free_quantity: null,
			}),
		).toBe(formatMoney("25000"));
	});

	test("buy N get M free names both quantities", () => {
		expect(
			formatCampaignDiscount({
				discount_type: "buy_n_get_m_free",
				discount_value: "0",
				max_discount: null,
				buy_quantity: 2,
				free_quantity: 1,
			}),
		).toBe("Buy 2 Get 1 Free");
	});
});
