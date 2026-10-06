import { describe, expect, it } from "bun:test";
import { getPaymentBadges } from "@/features/orders/lib/payment-badges";

const labels = (...args: Parameters<typeof getPaymentBadges>) =>
	getPaymentBadges(...args).map((badge) => badge.label);

describe("getPaymentBadges", () => {
	it("shows Paid with no refund", () => {
		expect(
			labels({
				payment_status: "paid",
				refund_status: "none",
				status: "processing",
			}),
		).toEqual(["Paid"]);
	});

	it("shows Paid plus Partial refund on a part refund", () => {
		expect(
			labels({
				payment_status: "paid",
				refund_status: "partial",
				status: "completed",
			}),
		).toEqual(["Paid", "Partial refund"]);
	});

	it("shows only Refunded on a full refund", () => {
		expect(
			labels({
				payment_status: "paid",
				refund_status: "full",
				status: "completed",
			}),
		).toEqual(["Refunded"]);
	});

	it("shows Unpaid on an unpaid Order", () => {
		expect(
			labels({
				payment_status: "unpaid",
				refund_status: "none",
				status: "created",
			}),
		).toEqual(["Unpaid"]);
	});

	it("shows nothing on an Order cancelled before payment", () => {
		expect(
			labels({
				payment_status: "unpaid",
				refund_status: "none",
				status: "cancelled",
			}),
		).toEqual([]);
	});
});
