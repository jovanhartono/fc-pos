import { describe, expect, test } from "bun:test";
import {
	type PreviewCampaign,
	previewDiscounts,
	toDiscountLines,
} from "./discount-preview";

const campaign = (
	id: number,
	overrides: Partial<PreviewCampaign> = {},
): PreviewCampaign => ({
	id,
	code: `C${id}`,
	name: `Campaign ${id}`,
	discount_type: "fixed",
	discount_value: "0",
	max_discount: null,
	min_order_total: "0",
	...overrides,
});

const noDiscounts = {
	eligible: [],
	pickedCampaignIds: [],
	vouchers: [],
	manualDiscount: "",
	deliveryFee: 0,
};

describe("previewDiscounts", () => {
	test("never discounts the Delivery fee", () => {
		const tenPercent = campaign(1, {
			discount_type: "percentage",
			discount_value: "10",
		});

		const preview = previewDiscounts({
			...noDiscounts,
			grossTotal: 100_000,
			lines: [],
			eligible: [tenPercent],
			pickedCampaignIds: ["1"],
			deliveryFee: 20_000,
		});

		expect(preview.totalDiscount).toBe(10_000);
		expect(preview.amountDue).toBe(110_000);
		expect(preview.rows).toEqual([
			{
				key: "campaign-1",
				label: "C1 (Campaign 1)",
				amount: 10_000,
				isDiscount: true,
			},
			{
				key: "delivery-fee",
				label: "Delivery fee",
				amount: 20_000,
				isDiscount: false,
			},
		]);
	});

	test("a manual discount larger than the total still leaves the Delivery fee", () => {
		const preview = previewDiscounts({
			...noDiscounts,
			grossTotal: 100_000,
			lines: [],
			manualDiscount: "150000",
			deliveryFee: 20_000,
		});

		expect(preview.totalDiscount).toBe(100_000);
		expect(preview.amountDue).toBe(20_000);
	});

	test("a discount larger than the Order leaves nothing due, never a negative", () => {
		const fifty = campaign(1, {
			discount_type: "percentage",
			discount_value: "50",
		});

		const preview = previewDiscounts({
			...noDiscounts,
			grossTotal: 20_000,
			lines: [],
			eligible: [fifty],
			pickedCampaignIds: ["1"],
			manualDiscount: "50000",
		});

		expect(preview.amountDue).toBe(0);
	});

	test("stacks a Voucher on a picked Campaign and skips the unpicked one", () => {
		const fixed = campaign(1, { discount_value: "20000" });
		const unpicked = campaign(2, { discount_value: "5000" });
		const voucher = campaign(3, {
			discount_type: "percentage",
			discount_value: "10",
		});

		const preview = previewDiscounts({
			...noDiscounts,
			grossTotal: 100_000,
			lines: [],
			eligible: [fixed, unpicked],
			pickedCampaignIds: ["1"],
			vouchers: [{ campaign: voucher }],
		});

		// 10% of what the Campaign left, not of the gross total.
		expect(preview.rows.map((row) => [row.key, row.amount])).toEqual([
			["campaign-1", 20_000],
			["campaign-3", 8000],
		]);
		expect(preview.totalDiscount).toBe(28_000);
		expect(preview.amountDue).toBe(72_000);
	});

	test("an Order refunded past what is left collects only the Delivery fee", () => {
		const preview = previewDiscounts({
			...noDiscounts,
			grossTotal: 100_000,
			lines: [],
			manualDiscount: "30000",
			deliveryFee: 15_000,
			refunded: 80_000,
		});

		expect(preview.amountDue).toBe(15_000);
	});

	test("a Repair is never the free one in a Buy N", () => {
		const repair = { id: 7, price: null };
		const deepClean = { id: 8, price: "50000" };
		// Lines of an Order already placed, as Collect Payment reads them.
		const orderLine = (
			service: { id: number; price: string | null },
			price: string,
		) => ({ price, service, status: "processing", complaint_id: null });
		const lines = toDiscountLines([
			orderLine(repair, "10000"),
			...Array.from({ length: 4 }, () => orderLine(deepClean, "50000")),
		]);
		const buy3Get1 = campaign(1, {
			discount_type: "buy_n_get_m_free",
			buy_quantity: 3,
			free_quantity: 1,
			eligibleServices: [{ service_id: 7 }, { service_id: 8 }],
		});

		const preview = previewDiscounts({
			...noDiscounts,
			grossTotal: 210_000,
			lines,
			eligible: [buy3Get1],
			pickedCampaignIds: ["1"],
		});

		expect(lines).toHaveLength(4);
		expect(preview.totalDiscount).toBe(50_000);
	});
});
