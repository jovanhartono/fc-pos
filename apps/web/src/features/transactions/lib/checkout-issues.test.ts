import { describe, expect, test } from "bun:test";
import type { FieldErrors } from "react-hook-form";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import {
	type CheckoutIssue,
	collectCheckoutIssues,
	describeServerFailure,
	summarizeCheckoutIssues,
} from "./checkout-issues";

const errors = (
	shape: Record<string, unknown>,
): FieldErrors<TransactionDraftValues> =>
	shape as FieldErrors<TransactionDraftValues>;

describe("collectCheckoutIssues", () => {
	test("an admin who never picked a store is told about the store, not the steps", () => {
		const issues = collectCheckoutIssues(
			errors({ selectedStoreId: { message: "Store is required." } }),
		);

		expect(issues).toEqual([
			{ target: "store", message: "Store is required." },
		]);
	});

	test("orders the report the way the cashier walks the sheet", () => {
		const issues = collectCheckoutIssues(
			errors({
				manualDiscount: { message: "Discount cannot be negative" },
				customerName: { message: "Customer name is required." },
				selectedStoreId: { message: "Store is required." },
			}),
		);

		expect(issues.map((issue) => issue.target)).toEqual([
			"store",
			"customer",
			"payment",
		]);
	});

	test("an empty cart points at the items step", () => {
		// The cart-total rule reports on productCart even when the cashier was
		// adding services, so both carts have to resolve to the same step.
		const issues = collectCheckoutIssues(
			errors({
				productCart: {
					message: "Add at least one product or service to the cart.",
				},
			}),
		);

		expect(issues).toEqual([
			{
				target: "items",
				message: "Add at least one product or service to the cart.",
			},
		]);
	});

	test("finds a message nested under one object's treatment, not just on the cart", () => {
		// ADR-0017 put a level between the cart and the treatment, so the walk
		// has to reach `itemCart[1].services[0].price` — a message stranded down
		// there would leave the footer saying only "check the cart".
		const issues = collectCheckoutIssues(
			errors({
				itemCart: [undefined, { services: [{ price: { message: "Price?" } }] }],
			}),
		);

		expect(issues).toEqual([{ target: "items", message: "Price?" }]);
	});

	test("a clean form reports nothing", () => {
		expect(collectCheckoutIssues(errors({}))).toHaveLength(0);
	});
});

describe("describeServerFailure", () => {
	test("a shoe the shop just sold out of names the product and the fix", () => {
		const issue = describeServerFailure(
			"Insufficient stock for product Nike Cleaner",
		);

		expect(issue.target).toBe("items");
		expect(issue.message).toBe(
			"Insufficient stock for product Nike Cleaner. Lower the quantity or remove the line.",
		);
	});

	test("a code the customer already used sends the cashier to payment", () => {
		expect(
			describeServerFailure("Voucher code HEMAT10 has already been redeemed")
				.target,
		).toBe("payment");
	});

	test("a courier who left the shop sends the cashier to the customer step", () => {
		expect(
			describeServerFailure("collected_by must reference an active courier")
				.target,
		).toBe("customer");
	});

	test("an unknown rejection is passed through as the server worded it", () => {
		const issue = describeServerFailure("Order already exists");

		expect(issue).toEqual({ target: null, message: "Order already exists" });
	});
});

describe("summarizeCheckoutIssues", () => {
	test("reads as one footer line", () => {
		const issues: CheckoutIssue[] = [
			{ target: "store", message: "Store is required." },
			{ target: "customer", message: "Phone number is required." },
		];

		expect(summarizeCheckoutIssues(issues)).toBe(
			"Store is required. Phone number is required.",
		);
	});
});
