export type CheckoutStep = "customer" | "items" | "payment";

// Single source of step order — the stepper, the gates, and the footer all
// derive next/back navigation and lock state from this list.
export const CHECKOUT_STEPS: { key: CheckoutStep; label: string }[] = [
	{ key: "customer", label: "Customer" },
	{ key: "items", label: "Items" },
	{ key: "payment", label: "Payment" },
];
