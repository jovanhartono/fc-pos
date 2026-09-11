import { describe, expect, it } from "bun:test";
import { describeOrderAmount } from "@/features/customers/lib/order-amount";
import { formatIDRCurrency } from "@/shared/utils";

describe("describeOrderAmount", () => {
	it("shows what the shop kept, not what was collected", () => {
		// Rina paid 800k and had a 250k line refunded — her row reads 550k, so
		// the column adds up to the Lifetime spend in the header.
		const amount = describeOrderAmount({
			has_unpriced_line: false,
			paid_amount: "800000",
			payment_status: "paid",
			refunded_amount: "250000",
		});

		expect(amount.label).toBe(formatIDRCurrency("550000"));
		expect(amount.label).not.toBe(formatIDRCurrency("800000"));
		expect(amount.refunded).toBe(formatIDRCurrency("250000"));
		expect(amount.isPending).toBe(false);
	});

	it("says nothing about refunds on an order that kept its money", () => {
		const amount = describeOrderAmount({
			has_unpriced_line: false,
			paid_amount: "250000",
			payment_status: "paid",
			refunded_amount: "0",
		});

		expect(amount.label).toBe(formatIDRCurrency("250000"));
		expect(amount.refunded).toBeNull();
	});

	it("reads as zero, not blank, when every rupiah went back", () => {
		const amount = describeOrderAmount({
			has_unpriced_line: false,
			paid_amount: "250000",
			payment_status: "paid",
			refunded_amount: "250000",
		});

		expect(amount.label).toBe(formatIDRCurrency("0"));
		expect(amount.refunded).toBe(formatIDRCurrency("250000"));
	});

	it("marks an unpaid order as owing rather than as zero", () => {
		const amount = describeOrderAmount({
			has_unpriced_line: false,
			paid_amount: "0",
			payment_status: "unpaid",
			refunded_amount: "0",
		});

		expect(amount).toEqual({
			isPending: true,
			label: "Unpaid",
			refunded: null,
		});
	});

	// The bag awaiting inspection: no number has been agreed, and "Rp 0" would
	// read as free (ADR-0018).
	it("says the price is pending while a repair is uninspected", () => {
		const amount = describeOrderAmount({
			has_unpriced_line: true,
			paid_amount: "0",
			payment_status: "unpaid",
			refunded_amount: "0",
		});

		expect(amount.label).toBe("Pending price");
		expect(amount.isPending).toBe(true);
	});
});
