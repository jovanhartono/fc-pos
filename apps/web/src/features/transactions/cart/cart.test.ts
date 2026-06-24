import { describe, expect, test } from "bun:test";
import {
	buildActiveItemMap,
	type CartCampaign,
	enrichProductCart,
	enrichServiceCart,
	getCartCount,
	getCartPricing,
	getCartSubtotal,
	type ProductCartLine,
	type ServiceCartLine,
	type TransactionDraftValues,
	toOrderPayload,
} from "./cart";

const productLine = (id: number, qty: number): ProductCartLine => ({
	kind: "product",
	id,
	qty,
});

const serviceLine = (
	lineId: string,
	id: number,
	overrides: Partial<ServiceCartLine> = {},
): ServiceCartLine => ({
	kind: "service",
	line_id: lineId,
	id,
	brand: "",
	color: "",
	model: "",
	size: "",
	...overrides,
});

describe("buildActiveItemMap", () => {
	test("keeps active items only, keyed by id", () => {
		const map = buildActiveItemMap([
			{ id: 1, is_active: true },
			{ id: 2, is_active: false },
			{ id: 3, is_active: true },
		]);
		expect([...map.keys()]).toEqual([1, 3]);
	});
});

describe("enrichProductCart / enrichServiceCart", () => {
	test("drops lines whose item is missing from the map", () => {
		const products = new Map([[1, { id: 1, price: "10000" }]]);
		const rows = enrichProductCart(
			[productLine(1, 2), productLine(99, 1)],
			products,
		);
		expect(rows).toEqual([
			{ kind: "product", id: 1, qty: 2, product: { id: 1, price: "10000" } },
		]);

		const services = new Map([[5, { id: 5, price: "50000" }]]);
		const serviceRows = enrichServiceCart(
			[serviceLine("a", 5), serviceLine("b", 6)],
			services,
		);
		expect(serviceRows.map((row) => row.line_id)).toEqual(["a"]);
	});
});

describe("getCartSubtotal", () => {
	test("sums product price × qty plus service prices", () => {
		const subtotal = getCartSubtotal(
			[
				{ qty: 2, product: { price: "10000" } },
				{ qty: 1, product: { price: "2500" } },
			],
			[{ service: { price: "50000" } }, { service: { price: "75000" } }],
		);
		expect(subtotal).toBe(2 * 10_000 + 2500 + 50_000 + 75_000);
	});
});

describe("getCartCount", () => {
	test("counts product quantities and service lines", () => {
		expect(
			getCartCount(
				[productLine(1, 3), productLine(2, 1)],
				[serviceLine("a", 5), serviceLine("b", 6)],
			),
		).toBe(6);
		expect(getCartCount([], [])).toBe(0);
	});
});

describe("getCartPricing", () => {
	const percentCampaign = (value: string): CartCampaign => ({
		discount_type: "percentage",
		discount_value: value,
		max_discount: null,
	});

	test("manual discount only", () => {
		const pricing = getCartPricing({
			subtotal: 100_000,
			campaigns: [],
			serviceLines: [],
			manualDiscount: "15000",
		});
		expect(pricing.campaignDiscount).toBe(0);
		expect(pricing.manualDiscount).toBe(15_000);
		expect(pricing.totalDiscount).toBe(15_000);
		expect(pricing.total).toBe(85_000);
	});

	test("empty manual discount reads as zero", () => {
		const pricing = getCartPricing({
			subtotal: 100_000,
			campaigns: [],
			serviceLines: [],
			manualDiscount: "",
		});
		expect(pricing.manualDiscount).toBe(0);
		expect(pricing.total).toBe(100_000);
	});

	test("stacks campaign and manual discount", () => {
		const pricing = getCartPricing({
			subtotal: 100_000,
			campaigns: [percentCampaign("10")],
			serviceLines: [],
			manualDiscount: "5000",
		});
		expect(pricing.campaignDiscount).toBe(10_000);
		expect(pricing.campaignBreakdown).toHaveLength(1);
		expect(pricing.campaignBreakdown[0].amount).toBe(10_000);
		expect(pricing.totalDiscount).toBe(15_000);
		expect(pricing.total).toBe(85_000);
	});

	test("clamps total discount at subtotal so total never goes negative", () => {
		const pricing = getCartPricing({
			subtotal: 20_000,
			campaigns: [percentCampaign("50")],
			serviceLines: [],
			manualDiscount: "50000",
		});
		expect(pricing.totalDiscount).toBe(20_000);
		expect(pricing.total).toBe(0);
	});
});

describe("toOrderPayload", () => {
	const draft: TransactionDraftValues = {
		selectedStoreId: "2",
		customerName: " budi santoso ",
		customerPhone: "081234567890",
		selectedCampaignIds: ["3", "4"],
		selectedPaymentMethodId: "",
		selectedCourierId: "",
		manualDiscount: "",
		notes: "  ",
		productCart: [productLine(1, 2)],
		serviceCart: [
			serviceLine("a", 5, { brand: " Adidas ", color: "", size: "42" }),
		],
	};

	test("maps draft to CreateOrderPayload with trimmed optional fields", () => {
		expect(toOrderPayload(draft)).toEqual({
			customer: {
				name: "budi santoso",
				phone_number: "+6281234567890",
			},
			store_id: 2,
			campaign_ids: [3, 4],
			discount: "0",
			payment_method_id: undefined,
			collected_by: undefined,
			payment_status: "unpaid",
			notes: undefined,
			products: [{ id: 1, qty: 2 }],
			services: [
				{
					id: 5,
					brand: "Adidas",
					color: undefined,
					model: undefined,
					size: "42",
					notes: undefined,
				},
			],
		});
	});

	test("a selected payment method marks the order paid and carries discount", () => {
		const payload = toOrderPayload({
			...draft,
			selectedPaymentMethodId: "9",
			manualDiscount: "2500",
		});
		expect(payload.payment_method_id).toBe(9);
		expect(payload.payment_status).toBe("paid");
		expect(payload.discount).toBe("2500");
	});
});
