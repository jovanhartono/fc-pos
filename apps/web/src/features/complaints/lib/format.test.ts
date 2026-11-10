import { describe, expect, it } from "bun:test";
import { formatComplaintItem, getComplaintOutcome } from "./format";

describe("formatComplaintItem", () => {
	it("drops the Order code the row already shows from the tag", () => {
		expect(
			formatComplaintItem({
				order_code: "#BSD/03092026/2",
				item_code: "#BSD/03092026/2-I001",
				item_brand: "Converse",
				item_model: "Premium",
				item_color: "orchid",
				item_size: null,
			}),
		).toBe("I001 · Converse · Premium · orchid");
	});

	it("reads the tag, then brand, model, colour and size, as every other row", () => {
		expect(
			formatComplaintItem({
				order_code: "#BSD/1",
				item_code: "I001",
				item_brand: "Nike",
				item_model: "AF1",
				item_color: "White",
				item_size: "42",
			}),
		).toBe("I001 · Nike · AF1 · White · 42");
	});

	it("skips missing parts without stray separators", () => {
		expect(
			formatComplaintItem({
				order_code: "#BSD/1",
				item_code: "I002",
				item_brand: null,
				item_model: "AF1",
				item_color: " ",
				item_size: null,
			}),
		).toBe("I002 · AF1");
		expect(
			formatComplaintItem({
				order_code: "#BSD/1",
				item_code: "I003",
				item_brand: null,
				item_model: null,
				item_color: null,
				item_size: null,
			}),
		).toBe("I003");
	});
});

describe("getComplaintOutcome", () => {
	it("reads Cancelled when the cashier cancelled the turned-down line", () => {
		expect(
			getComplaintOutcome({ status: "cancelled", has_live_rework: false })
				.label,
		).toBe("Cancelled");
	});

	it("keeps Refunded ahead of any rework", () => {
		expect(
			getComplaintOutcome({ status: "refunded", has_live_rework: true }).label,
		).toBe("Refunded");
	});

	it("reads Reworked once a round is on the rack, at the counter or after pickup", () => {
		expect(
			getComplaintOutcome({ status: "ready_for_pickup", has_live_rework: true })
				.label,
		).toBe("Reworked");
		expect(
			getComplaintOutcome({ status: "picked_up", has_live_rework: true }).label,
		).toBe("Reworked");
	});

	it("stays Pending while nothing has been decided", () => {
		expect(
			getComplaintOutcome({
				status: "ready_for_pickup",
				has_live_rework: false,
			}).label,
		).toBe("Pending");
	});
});
