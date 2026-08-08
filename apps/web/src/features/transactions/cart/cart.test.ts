import { describe, expect, test } from "bun:test";
import {
	type AppliedVoucher,
	buildActiveItemMap,
	type CartCampaign,
	countUnpricedServiceLines,
	enrichProductCart,
	enrichServiceCart,
	getCartCampaignBase,
	getCartCount,
	getCartPricing,
	getCartSubtotal,
	hasEstimateLine,
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
	notes: "",
	price: "",
	is_estimate: false,
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
			[
				{ price: "", service: { price: "50000" } },
				{ price: "", service: { price: "75000" } },
			],
		);
		expect(subtotal).toBe(2 * 10_000 + 2500 + 50_000 + 75_000);
	});

	test("a repair line counts at the cashier's keyed price, not the catalog", () => {
		// Repair has no list price (ADR-0018): the line total IS the quote.
		const subtotal = getCartSubtotal(
			[],
			[
				{ price: "200000", service: { price: null } },
				{ price: "", service: { price: "50000" } },
			],
		);
		expect(subtotal).toBe(250_000);
	});
});

describe("getCartCampaignBase", () => {
	test("excludes repair lines — firm or Estimate — from the campaign base", () => {
		// ADR-0019's failure case: deep clean 150k + repair 200k is gross 350k,
		// but a "min order 250k" campaign must see only the 150k that cannot
		// move after checkout.
		const base = getCartCampaignBase(
			[],
			[
				{ price: "", service: { price: "150000" } },
				{ price: "200000", service: { price: null } },
			],
		);
		expect(base).toBe(150_000);
	});

	test("equals the subtotal when every line is catalog-priced", () => {
		const productRows = [{ qty: 2, product: { price: "10000" } }];
		const serviceRows = [{ price: "", service: { price: "50000" } }];
		expect(getCartCampaignBase(productRows, serviceRows)).toBe(
			getCartSubtotal(productRows, serviceRows),
		);
	});
});

describe("hasEstimateLine / countUnpricedServiceLines", () => {
	test("an Estimate on a no-list-price line locks the tender tiles", () => {
		expect(
			hasEstimateLine([
				{ is_estimate: true, service: { price: null } },
				{ is_estimate: false, service: { price: "50000" } },
			]),
		).toBe(true);
		// is_estimate is meaningless on a catalog-priced line — never a lock.
		expect(
			hasEstimateLine([{ is_estimate: true, service: { price: "50000" } }]),
		).toBe(false);
	});

	test("counts repair lines still waiting for a price", () => {
		expect(
			countUnpricedServiceLines([
				{ price: "", service: { price: null } },
				{ price: "200000", service: { price: null } },
				{ price: "", service: { price: "50000" } },
			]),
		).toBe(1);
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
			campaignBase: 100_000,
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
			campaignBase: 100_000,
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
			campaignBase: 100_000,
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

	test("clamps total discount at the campaign base so total never goes negative", () => {
		const pricing = getCartPricing({
			subtotal: 20_000,
			campaignBase: 20_000,
			campaigns: [percentCampaign("50")],
			serviceLines: [],
			manualDiscount: "50000",
		});
		expect(pricing.totalDiscount).toBe(20_000);
		expect(pricing.total).toBe(0);
	});

	test("campaigns and manual discount run on the fixed-price base, never the repair quote", () => {
		// Deep clean 150k + repair 200k (ADR-0019): a 20% campaign discounts
		// 20% of 150k, and a fat manual discount can only eat what the fixed
		// base has left — the repair's 200k stays fully payable, exactly as
		// the server will compute it.
		const pricing = getCartPricing({
			subtotal: 350_000,
			campaignBase: 150_000,
			campaigns: [percentCampaign("20")],
			serviceLines: [],
			manualDiscount: "500000",
		});
		expect(pricing.campaignDiscount).toBe(30_000);
		expect(pricing.totalDiscount).toBe(150_000);
		expect(pricing.total).toBe(200_000);
	});
});

describe("toOrderPayload", () => {
	const draft: TransactionDraftValues = {
		selectedStoreId: "2",
		customerName: " budi santoso ",
		customerPhone: "081234567890",
		selectedCampaignIds: ["3", "4"],
		appliedVouchers: [],
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
			voucher_codes: [],
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
					price: undefined,
					is_estimate: undefined,
				},
			],
		});
	});

	test("carries the repair quote and Estimate flag onto the line", () => {
		const payload = toOrderPayload({
			...draft,
			serviceCart: [
				serviceLine("a", 7, { price: "200000", is_estimate: true }),
			],
		});
		expect(payload.services).toEqual([
			{
				id: 7,
				brand: undefined,
				color: undefined,
				model: undefined,
				size: undefined,
				notes: undefined,
				price: "200000",
				is_estimate: true,
			},
		]);
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

	test("carries per-item notes, trimmed, and drops blank ones", () => {
		const payload = toOrderPayload({
			...draft,
			serviceCart: [
				serviceLine("a", 5, { notes: "  sol kanan lepas  " }),
				serviceLine("b", 6, { notes: "   " }),
			],
		});
		expect(payload.services).toEqual([
			{
				id: 5,
				brand: undefined,
				color: undefined,
				model: undefined,
				size: undefined,
				notes: "sol kanan lepas",
				price: undefined,
				is_estimate: undefined,
			},
			{
				id: 6,
				brand: undefined,
				color: undefined,
				model: undefined,
				size: undefined,
				notes: undefined,
				price: undefined,
				is_estimate: undefined,
			},
		]);
	});

	test("carries applied voucher codes into voucher_codes, trimmed", () => {
		const payload = toOrderPayload({
			...draft,
			appliedVouchers: ["  ABC123DE  ", "XYZ789FG"].map((code) => ({
				code,
				campaign: { id: 1 } as AppliedVoucher["campaign"],
			})),
		});
		expect(payload.voucher_codes).toEqual(["ABC123DE", "XYZ789FG"]);
	});
});
