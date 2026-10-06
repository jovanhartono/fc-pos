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
			}),
		).toBe("I001 · Converse Premium orchid");
	});

	it("reads the tag, then brand, model and colour", () => {
		expect(
			formatComplaintItem({
				order_code: "#BSD/1",
				item_code: "I001",
				item_brand: "Nike",
				item_model: "AF1",
				item_color: "White",
			}),
		).toBe("I001 · Nike AF1 White");
	});

	it("skips missing parts without stray separators", () => {
		expect(
			formatComplaintItem({
				order_code: "#BSD/1",
				item_code: "I002",
				item_brand: null,
				item_model: "AF1",
				item_color: " ",
			}),
		).toBe("I002 · AF1");
		expect(
			formatComplaintItem({
				order_code: "#BSD/1",
				item_code: "I003",
				item_brand: null,
				item_model: null,
				item_color: null,
			}),
		).toBe("I003");
	});
});

describe("getComplaintOutcome", () => {
	it("reads Cancelled when the cashier cancelled the turned-down line", () => {
		expect(
			getComplaintOutcome({ subjectStatus: "cancelled", reworkCount: 0 }).label,
		).toBe("Cancelled");
	});

	it("keeps Refunded ahead of any rework", () => {
		expect(
			getComplaintOutcome({ subjectStatus: "refunded", reworkCount: 1 }).label,
		).toBe("Refunded");
	});

	it("reads Reworked once a round is on the rack, at the counter or after pickup", () => {
		expect(
			getComplaintOutcome({ subjectStatus: "ready_for_pickup", reworkCount: 1 })
				.label,
		).toBe("Reworked");
		expect(
			getComplaintOutcome({ subjectStatus: "picked_up", reworkCount: 2 }).label,
		).toBe("Reworked");
	});

	it("stays Pending while nothing has been decided", () => {
		expect(
			getComplaintOutcome({ subjectStatus: "ready_for_pickup", reworkCount: 0 })
				.label,
		).toBe("Pending");
	});
});
