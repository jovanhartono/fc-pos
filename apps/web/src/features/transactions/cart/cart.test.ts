import { describe, expect, test } from "bun:test";
import {
	type AppliedVoucher,
	buildActiveItemMap,
	type CartCampaign,
	countUnpricedServiceLines,
	enrichItemCart,
	enrichProductCart,
	enrichServiceCart,
	getCartCount,
	getCartPricing,
	getCartSubtotal,
	type ItemCartLine,
	moveCartService,
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
	notes: "",
	price: "",
	...overrides,
});

// One object on the counter. Descriptors live here now, and the treatments
// sold against it nest inside (ADR-0017).
const itemLine = (
	lineId: string,
	services: ServiceCartLine[],
	overrides: Partial<Omit<ItemCartLine, "services">> = {},
): ItemCartLine => ({
	line_id: lineId,
	brand: "",
	color: "",
	model: "",
	size: "",
	...overrides,
	services,
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

describe("enrichItemCart", () => {
	// The cashier taps "+ New item" the moment the second shoe hits the counter,
	// types its brand and size, and only then picks the treatment. A card that
	// vanished until it had a treatment on it would swallow what he just typed.
	test("keeps a card the cashier just opened, before any treatment", () => {
		const services = new Map([[5, { id: 5, price: "50000" }]]);
		const rows = enrichItemCart(
			[
				itemLine("shoe-1", [serviceLine("a", 5)]),
				itemLine("shoe-2", [], { brand: "Adidas", size: "43" }),
			],
			services,
		);

		expect(rows.map((row) => row.line_id)).toEqual(["shoe-1", "shoe-2"]);
		expect(rows[1].brand).toBe("Adidas");
		expect(rows[1].services).toEqual([]);
	});

	// Pulling the last treatment off a card is a mid-correction, not a delete —
	// the shoe is still on the counter. It is dropped on the way to the wire.
	test("keeps a card whose treatments were all retired from the catalog", () => {
		const rows = enrichItemCart(
			[itemLine("shoe-1", [serviceLine("a", 5)])],
			new Map(),
		);

		expect(rows).toHaveLength(1);
		expect(rows[0].services).toEqual([]);
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
		// Repair has no list price (ADR-0018): the line total IS the agreed price.
		const subtotal = getCartSubtotal(
			[],
			[
				{ price: "200000", service: { price: null } },
				{ price: "", service: { price: "50000" } },
			],
		);
		expect(subtotal).toBe(250_000);
	});

	test("a blank repair line adds nothing — its price is absent, not zero", () => {
		// ADR-0018: NULL means "not yet determined". The drop-off receipt shows
		// the gross of what IS priced; the blank line must not be read as a
		// deliberately free Rework.
		const subtotal = getCartSubtotal(
			[],
			[
				{ price: "", service: { price: null } },
				{ price: "", service: { price: "50000" } },
			],
		);
		expect(subtotal).toBe(50_000);
	});
});

describe("countUnpricedServiceLines", () => {
	test("counts repair lines left blank for pricing after inspection", () => {
		expect(
			countUnpricedServiceLines([
				{ price: "", service: { price: null } },
				{ price: "200000", service: { price: null } },
				{ price: "", service: { price: "50000" } },
			]),
		).toBe(1);
	});

	test("a fully keyed or catalog-priced cart has nothing blocking payment", () => {
		// A blank line only blocks paying at drop-off (ADR-0018) — checkout
		// itself always goes through, so zero here is what unlocks the tender.
		expect(
			countUnpricedServiceLines([
				{ price: "150000", service: { price: null } },
				{ price: "", service: { price: "50000" } },
			]),
		).toBe(0);
	});
});

describe("getCartCount", () => {
	test("counts product quantities and treatments, not objects", () => {
		// Four bottles plus a pair sold two treatments and a bag sold one: the
		// badge answers "how many things are on this bill", and an upsold pair is
		// two of them even though the customer handed over one shoe (ADR-0017).
		expect(
			getCartCount(
				[productLine(1, 3), productLine(2, 1)],
				[
					itemLine("i1", [serviceLine("a", 5), serviceLine("b", 6)]),
					itemLine("i2", [serviceLine("c", 7)]),
				],
			),
		).toBe(7);
		expect(getCartCount([], [])).toBe(0);
		// A card the cashier opened but has not sold anything yet counts nothing.
		expect(getCartCount([], [itemLine("i1", [])])).toBe(0);
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

	test("campaigns run on the full order total — repair spend counts (ADR-0018)", () => {
		// The owner's reversal of ADR-0019: deep clean 150k + repair 200k is a
		// 350k order, and a 20% campaign discounts 20% of 350k, because at the
		// moment money moves every number is final.
		const pricing = getCartPricing({
			subtotal: 350_000,
			campaigns: [percentCampaign("20")],
			serviceLines: [],
			manualDiscount: "",
		});
		expect(pricing.campaignDiscount).toBe(70_000);
		expect(pricing.total).toBe(280_000);
	});

	test("clamps total discount at the subtotal so total never goes negative", () => {
		const pricing = getCartPricing({
			subtotal: 20_000,
			campaigns: [percentCampaign("50")],
			serviceLines: [],
			manualDiscount: "50000",
		});
		expect(pricing.totalDiscount).toBe(20_000);
		expect(pricing.total).toBe(0);
	});

	test("reports the manual discount that was actually applied, not the keyed one", () => {
		// The summary line must show what came off, because the total beside it
		// was worked out that way — a typed 50k next to a 20k cart would give
		// the cashier a column that does not add up.
		const pricing = getCartPricing({
			subtotal: 20_000,
			campaigns: [percentCampaign("50")],
			serviceLines: [],
			manualDiscount: "50000",
		});
		expect(pricing.manualDiscount).toBe(10_000);
		expect(pricing.campaignDiscount + pricing.manualDiscount).toBe(
			pricing.totalDiscount,
		);
	});
});

describe("toOrderPayload", () => {
	const draft: TransactionDraftValues = {
		selectedStoreId: "2",
		customerName: " budi santoso ",
		customerPhone: "081234567890",
		selectedCampaignIds: [],
		appliedVouchers: [],
		selectedPaymentMethodId: "",
		selectedCourierId: "",
		manualDiscount: "",
		notes: "  ",
		productCart: [productLine(1, 2)],
		itemCart: [
			itemLine("i1", [serviceLine("a", 5)], {
				brand: " Adidas ",
				color: "",
				size: "42",
			}),
		],
	};

	test("maps draft to CreateOrderPayload with trimmed optional fields", () => {
		expect(toOrderPayload(draft)).toEqual({
			customer: {
				name: "budi santoso",
				phone_number: "+6281234567890",
			},
			store_id: 2,
			campaign_ids: [],
			voucher_codes: [],
			discount: "0",
			payment_method_id: undefined,
			collected_by: undefined,
			payment_status: "unpaid",
			notes: undefined,
			products: [{ id: 1, qty: 2 }],
			items: [
				{
					brand: "Adidas",
					color: undefined,
					model: undefined,
					size: "42",
					services: [{ id: 5, notes: undefined, price: undefined }],
				},
			],
		});
	});

	test("sends one pair sold three treatments as a single object", () => {
		// ADR-0017's whole point: the descriptors are typed once and travel once,
		// however many treatments the counter upsold onto the shoe.
		const payload = toOrderPayload({
			...draft,
			itemCart: [
				itemLine(
					"i1",
					[serviceLine("a", 5), serviceLine("b", 6), serviceLine("c", 7)],
					{ brand: "Nike", color: "Black" },
				),
			],
		});
		expect(payload.items).toHaveLength(1);
		expect(payload.items?.[0].brand).toBe("Nike");
		expect(payload.items?.[0].services.map((s) => s.id)).toEqual([5, 6, 7]);
	});

	test("drops an object the cashier opened but never sold anything", () => {
		// An empty card is a correction in progress, not an intake — it stays on
		// screen but never reaches the wire.
		const payload = toOrderPayload({
			...draft,
			itemCart: [itemLine("i1", []), itemLine("i2", [serviceLine("a", 5)])],
		});
		expect(payload.items).toHaveLength(1);
		expect(payload.items?.[0].services.map((s) => s.id)).toEqual([5]);
	});

	test("carries an agreed repair price onto the line, and omits a blank one", () => {
		// ADR-0018: blank means "not yet determined" — the payload must leave
		// the field out entirely, never send "" or 0.
		const payload = toOrderPayload({
			...draft,
			itemCart: [
				itemLine("i1", [
					serviceLine("a", 7, { price: "200000" }),
					serviceLine("b", 7, { price: "  " }),
				]),
			],
		});
		expect(payload.items?.[0].services[0].price).toBe("200000");
		expect(payload.items?.[0].services[1].price).toBe(undefined);
	});

	test("a selected payment method marks the order paid and carries discounts", () => {
		// Paying at drop-off IS the payment moment (ADR-0018), so promos,
		// voucher codes, and the manual discount ride the create payload.
		const payload = toOrderPayload({
			...draft,
			selectedPaymentMethodId: "9",
			selectedCampaignIds: ["3", "4"],
			appliedVouchers: [
				{ code: "ABC123DE", campaign: { id: 1 } as AppliedVoucher["campaign"] },
			],
			manualDiscount: "2500",
		});
		expect(payload.payment_method_id).toBe(9);
		expect(payload.payment_status).toBe("paid");
		expect(payload.campaign_ids).toEqual([3, 4]);
		expect(payload.voucher_codes).toEqual(["ABC123DE"]);
		expect(payload.discount).toBe("2500");
	});

	test("carries per-treatment notes, trimmed, and drops blank ones", () => {
		// Notes stay on the treatment, not the object: "no bleach" is an
		// instruction for one job, and the same shoe's repaint may want none.
		const payload = toOrderPayload({
			...draft,
			itemCart: [
				itemLine("i1", [
					serviceLine("a", 5, { notes: "  sol kanan lepas  " }),
					serviceLine("b", 6, { notes: "   " }),
				]),
			],
		});
		expect(payload.items?.[0].services).toEqual([
			{ id: 5, notes: "sol kanan lepas", price: undefined },
			{ id: 6, notes: undefined, price: undefined },
		]);
	});

	test("carries applied voucher codes into voucher_codes, trimmed", () => {
		const payload = toOrderPayload({
			...draft,
			selectedPaymentMethodId: "9",
			appliedVouchers: ["  ABC123DE  ", "XYZ789FG"].map((code) => ({
				code,
				campaign: { id: 1 } as AppliedVoucher["campaign"],
			})),
		});
		expect(payload.voucher_codes).toEqual(["ABC123DE", "XYZ789FG"]);
	});
});

describe("moveCartService", () => {
	// The three-shoes counter mistake: each shoe needs a Deep Clean, but every
	// tap landed on the first card. Recovery is moving lines, not retyping them.
	test("carries the whole line — notes and keyed price included — to the target card", () => {
		const line = serviceLine("b", 6, { notes: "no bleach", price: "75000" });
		const cart = [
			itemLine("i1", [serviceLine("a", 5), line]),
			itemLine("i2", []),
		];
		const moved = moveCartService(cart, "i1", "b", "i2");
		expect(moved?.cart[0].services.map((s) => s.line_id)).toEqual(["a"]);
		expect(moved?.cart[1].services).toEqual([line]);
		// Landed on a card that already existed, so nothing new to point at.
		expect(moved?.createdItemId).toBeNull();
	});

	test("splits onto a fresh card when the tap should have been a second shoe", () => {
		const cart = [itemLine("i1", [serviceLine("a", 5), serviceLine("b", 5)])];
		const moved = moveCartService(cart, "i1", "b", null);
		expect(moved?.cart).toHaveLength(2);
		expect(moved?.cart[0].services.map((s) => s.line_id)).toEqual(["a"]);
		expect(moved?.cart[1].services.map((s) => s.line_id)).toEqual(["b"]);
		// A fresh card starts undescribed — the cashier has not typed anything
		// about the second shoe yet — and is named so the next catalog tap can
		// land on it, the way "+ Item" does.
		expect(moved?.cart[1].brand).toBe("");
		expect(moved?.createdItemId).toBe(moved?.cart[1].line_id);
	});

	test("refuses rather than drops the line when the target card is gone", () => {
		// A stale menu can name a card another tap already removed; the line must
		// stay where it is, never vanish off the bill.
		const cart = [itemLine("i1", [serviceLine("a", 5)])];
		expect(moveCartService(cart, "i1", "a", "gone")).toBeNull();
		expect(moveCartService(cart, "i1", "missing-line", null)).toBeNull();
		expect(moveCartService(cart, "i1", "a", "i1")).toBeNull();
	});
});
