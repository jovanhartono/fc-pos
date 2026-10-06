import { describe, expect, it } from "bun:test";
import {
	getItemTotalRow,
	showsPickupProgress,
} from "@/features/orders/lib/order-sheet";

const line = (
	overrides: Partial<Parameters<typeof getItemTotalRow>[0][number]> = {},
) => ({
	complaint_id: null,
	price: "50000",
	status: "queued",
	subtotal: "50000",
	...overrides,
});

describe("showsPickupProgress", () => {
	it("stays hidden on a new Order with nothing ready", () => {
		expect(
			showsPickupProgress([
				{ is_collectable: false, status: "queued" },
				{ is_collectable: false, status: "processing" },
			]),
		).toBe(false);
	});

	it("shows once one Item is Collectable", () => {
		expect(
			showsPickupProgress([
				{ is_collectable: true, status: "ready_for_pickup" },
				{ is_collectable: false, status: "processing" },
			]),
		).toBe(true);
	});

	it("keeps showing once an Item has been picked up", () => {
		expect(
			showsPickupProgress([
				{ is_collectable: false, status: "picked_up" },
				{ is_collectable: false, status: "queued" },
			]),
		).toBe(true);
	});

	it("stays hidden on an Order with no Items", () => {
		expect(showsPickupProgress([])).toBe(false);
	});
});

describe("getItemTotalRow", () => {
	it("has no row for one Service", () => {
		expect(getItemTotalRow([line()])).toBeNull();
	});

	it("leaves a cancelled Line out of the count and the sum", () => {
		expect(
			getItemTotalRow([line(), line({ status: "cancelled", price: null })]),
		).toBeNull();
		expect(
			getItemTotalRow([
				line(),
				line({ subtotal: "20000" }),
				line({ status: "cancelled", subtotal: "99000" }),
			]),
		).toEqual({ amount: 70000 });
	});

	it("leaves a refunded Service out of the count and the sum", () => {
		expect(
			getItemTotalRow([
				line(),
				line({ subtotal: "20000" }),
				line({ status: "refunded", subtotal: "30000" }),
			]),
		).toEqual({ amount: 70000 });
		expect(getItemTotalRow([line(), line({ status: "refunded" })])).toBeNull();
	});

	it("has no row for one paid Service plus a free Rework", () => {
		expect(
			getItemTotalRow([
				line({ status: "picked_up" }),
				line({ complaint_id: 4, price: "0", subtotal: "0" }),
			]),
		).toBeNull();
	});

	it("sums two paid Services", () => {
		expect(
			getItemTotalRow([line(), line({ price: "30000", subtotal: "30000" })]),
		).toEqual({ amount: 80000 });
	});

	it("has no amount while a Line is unpriced", () => {
		expect(
			getItemTotalRow([line(), line({ price: null, subtotal: "0" })]),
		).toEqual({ amount: null });
	});
});
