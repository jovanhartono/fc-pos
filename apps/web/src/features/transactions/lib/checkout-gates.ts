import { isValidPhoneNumber } from "@fresclean/api/schema";
import type { IntakeChannel } from "@/features/orders/api";
import {
	CHECKOUT_STEPS,
	type CheckoutStep,
} from "@/features/transactions/lib/checkout-steps";

export interface CheckoutGateInput {
	customerName: string;
	customerPhone: string;
	intakeChannel: IntakeChannel;
	selectedCourierId: string;
	itemCount: number;
	hasDropoffPhoto: boolean;
}

export interface CheckoutGates {
	customerReady: boolean;
	itemsReady: boolean;
}

// The cart→payment gate: a customer is ready once they have a name and a phone
// that parses. Shared by the step tabs, the Continue button, and the Create
// Order button so all three progression controls enforce the identical rule.
export const isCustomerReady = (
	customerName: string,
	customerPhone: string,
): boolean =>
	customerName.trim().length > 0 && isValidPhoneNumber(customerPhone);

// A courier order that cannot say which courier fetched the Items is rejected
// by the database, so the counter has to stop before payment. The origin is
// deliberately absent — it is optional on every channel.
export const isCourierNamed = (
	intakeChannel: IntakeChannel,
	selectedCourierId: string,
): boolean => intakeChannel !== "courier" || selectedCourierId !== "";

export const getCheckoutGates = (input: CheckoutGateInput): CheckoutGates => ({
	customerReady:
		isCustomerReady(input.customerName, input.customerPhone) &&
		isCourierNamed(input.intakeChannel, input.selectedCourierId),
	itemsReady: input.itemCount > 0 && input.hasDropoffPhoto,
});

// The current step and any earlier one are always reachable — going back to
// fix a field is never blocked. A later step is reachable only when its entry
// gate passes, so the tabs can't skip ahead with an incomplete customer or a
// missing photo.
export const isStepReachable = (
	gates: CheckoutGates,
	current: CheckoutStep,
	target: CheckoutStep,
): boolean => {
	const currentIndex = CHECKOUT_STEPS.findIndex(
		(entry) => entry.key === current,
	);
	const targetIndex = CHECKOUT_STEPS.findIndex((entry) => entry.key === target);
	if (targetIndex <= currentIndex) {
		return true;
	}
	if (target === "payment") {
		return gates.customerReady && gates.itemsReady;
	}
	// Only "items" can reach here — "customer" is always at or before the
	// current step and already returned above.
	return gates.customerReady;
};

export const lockedStepHint = (
	gates: CheckoutGates,
	current: CheckoutStep,
	input: CheckoutGateInput,
): string => {
	const currentIndex = CHECKOUT_STEPS.findIndex(
		(entry) => entry.key === current,
	);
	const locked = CHECKOUT_STEPS.filter(
		(entry, index) =>
			index > currentIndex && !isStepReachable(gates, current, entry.key),
	);
	if (locked.length === 0) {
		return "";
	}
	const steps = locked.map((entry) => entry.label).join(" and ");
	const verb = locked.length > 1 ? "unlock" : "unlocks";
	if (!gates.customerReady) {
		// Naming only the identity fields would stall a cashier who has already
		// typed them and is blocked on the courier instead.
		const missingCustomer = [
			isCustomerReady(input.customerName, input.customerPhone)
				? null
				: "enter the customer name and phone",
			isCourierNamed(input.intakeChannel, input.selectedCourierId)
				? null
				: "pick the courier who collected it",
		]
			.filter(Boolean)
			.join(", and ");
		return `${steps} ${verb} once you ${missingCustomer}.`;
	}
	const missing = [
		input.itemCount > 0 ? null : "an item",
		input.hasDropoffPhoto ? null : "a drop-off photo",
	]
		.filter(Boolean)
		.join(" and ");
	return `${steps} ${verb} once you add ${missing}.`;
};
