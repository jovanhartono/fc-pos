import { describe, expect, test } from "bun:test";
import {
	type CheckoutGateInput,
	getCheckoutGates,
	isCustomerReady,
	isStepReachable,
	lockedStepHint,
} from "./checkout-gates";

describe("isCustomerReady", () => {
	test("needs both a name and a phone that parses", () => {
		expect(isCustomerReady("", "")).toBe(false);
		expect(isCustomerReady("Budi", "")).toBe(false);
		expect(isCustomerReady("Budi", "081234567890")).toBe(true);
	});
});

describe("getCheckoutGates", () => {
	test("items are ready only with a cart and a drop-off photo", () => {
		expect(
			getCheckoutGates({
				customerName: "Budi",
				customerPhone: "081234567890",
				intakeChannel: "walk_in",
				selectedCourierId: "",
				itemCount: 0,
				hasDropoffPhoto: true,
			}),
		).toEqual({ customerReady: true, itemsReady: false });

		expect(
			getCheckoutGates({
				customerName: "Budi",
				customerPhone: "081234567890",
				intakeChannel: "walk_in",
				selectedCourierId: "",
				itemCount: 1,
				hasDropoffPhoto: false,
			}),
		).toEqual({ customerReady: true, itemsReady: false });

		expect(
			getCheckoutGates({
				customerName: "Budi",
				customerPhone: "081234567890",
				intakeChannel: "walk_in",
				selectedCourierId: "",
				itemCount: 1,
				hasDropoffPhoto: true,
			}),
		).toEqual({ customerReady: true, itemsReady: true });
	});
});

// A courier order that cannot say which courier fetched it is rejected by the
// database, so the counter has to stop before the cashier reaches payment.
describe("the courier half of the customer gate", () => {
	const gates = (patch: Partial<CheckoutGateInput>) =>
		getCheckoutGates({
			customerName: "Bu Sri",
			customerPhone: "081234567890",
			intakeChannel: "walk_in",
			selectedCourierId: "",
			itemCount: 1,
			hasDropoffPhoto: true,
			...patch,
		}).customerReady;

	test("a walk-in needs only a name and a phone", () => {
		expect(gates({})).toBe(true);
	});

	test("a courier order is not ready until it names its courier", () => {
		expect(gates({ intakeChannel: "courier" })).toBe(false);
		expect(gates({ intakeChannel: "courier", selectedCourierId: "7" })).toBe(
			true,
		);
	});

	test("a shipped order needs no courier", () => {
		expect(gates({ intakeChannel: "shipped" })).toBe(true);
	});

	test("names the courier as well when both halves are missing", () => {
		expect(
			lockedStepHint({ customerReady: false, itemsReady: false }, "customer", {
				customerName: "",
				customerPhone: "",
				intakeChannel: "courier",
				selectedCourierId: "",
				itemCount: 0,
				hasDropoffPhoto: false,
			}),
		).toBe(
			"Items and Payment unlock once you enter the customer name and phone, and pick the courier who collected it.",
		);
	});
});

describe("isStepReachable", () => {
	test("the current step and any earlier one are always reachable", () => {
		const gates = { customerReady: false, itemsReady: false };
		expect(isStepReachable(gates, "payment", "customer")).toBe(true);
		expect(isStepReachable(gates, "payment", "items")).toBe(true);
		expect(isStepReachable(gates, "payment", "payment")).toBe(true);
	});

	test("items needs a ready customer; payment needs both", () => {
		expect(
			isStepReachable(
				{ customerReady: false, itemsReady: false },
				"customer",
				"items",
			),
		).toBe(false);
		expect(
			isStepReachable(
				{ customerReady: true, itemsReady: false },
				"customer",
				"items",
			),
		).toBe(true);
		expect(
			isStepReachable(
				{ customerReady: true, itemsReady: false },
				"items",
				"payment",
			),
		).toBe(false);
		expect(
			isStepReachable(
				{ customerReady: true, itemsReady: true },
				"items",
				"payment",
			),
		).toBe(true);
	});
});

describe("lockedStepHint", () => {
	const input = {
		customerName: "",
		customerPhone: "",
		intakeChannel: "walk_in" as const,
		selectedCourierId: "",
		itemCount: 0,
		hasDropoffPhoto: false,
	};

	test("names both locked steps until the customer is ready", () => {
		expect(
			lockedStepHint(
				{ customerReady: false, itemsReady: false },
				"customer",
				input,
			),
		).toBe(
			"Items and Payment unlock once you enter the customer name and phone.",
		);
	});

	test("names only Payment once the customer is ready but items are not", () => {
		expect(
			lockedStepHint({ customerReady: true, itemsReady: false }, "items", {
				...input,
				customerName: "Budi",
				customerPhone: "081234567890",
			}),
		).toBe("Payment unlocks once you add an item and a drop-off photo.");
	});

	test("is empty once nothing ahead is locked", () => {
		expect(
			lockedStepHint({ customerReady: true, itemsReady: true }, "payment", {
				...input,
				customerName: "Budi",
				customerPhone: "081234567890",
				itemCount: 1,
				hasDropoffPhoto: true,
			}),
		).toBe("");
	});
});
