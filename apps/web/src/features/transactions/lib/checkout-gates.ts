import { isValidPhoneNumber } from "@fresclean/api/schema";
import {
	CHECKOUT_STEPS,
	type CheckoutStep,
} from "@/features/transactions/lib/checkout-steps";

export interface CheckoutGateInput {
	customerName: string;
	customerPhone: string;
	itemCount: number;
	hasDropoffPhoto: boolean;
}

export interface CheckoutGates {
	customerReady: boolean;
	itemsReady: boolean;
}

// Shared by the step tabs, Continue and Create Order so all three apply the
// same rule.
export const isCustomerReady = (
	customerName: string,
	customerPhone: string,
): boolean =>
	customerName.trim().length > 0 && isValidPhoneNumber(customerPhone);

export const getCheckoutGates = (input: CheckoutGateInput): CheckoutGates => ({
	customerReady: isCustomerReady(input.customerName, input.customerPhone),
	itemsReady: input.itemCount > 0 && input.hasDropoffPhoto,
});

// Going back to fix a field is never blocked; the tabs can't skip ahead with an
// incomplete Customer or a missing photo.
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
		return `${steps} ${verb} once you enter the customer name and phone.`;
	}
	const missing = [
		input.itemCount > 0 ? null : "an item",
		input.hasDropoffPhoto ? null : "a drop-off photo",
	]
		.filter(Boolean)
		.join(" and ");
	return `${steps} ${verb} once you add ${missing}.`;
};
