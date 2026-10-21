export type CheckoutStep = "customer" | "items" | "payment";

export const CHECKOUT_STEPS: { key: CheckoutStep; label: string }[] = [
	{ key: "customer", label: "Customer" },
	{ key: "items", label: "Items" },
	{ key: "payment", label: "Payment" },
];
