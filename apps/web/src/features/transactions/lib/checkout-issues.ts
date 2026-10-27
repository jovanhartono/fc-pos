import type { FieldErrors } from "react-hook-form";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import type { CheckoutStep } from "@/features/transactions/lib/checkout-steps";

// "store" is not a step: the Store picker sits behind the checkout sheet, so its
// own error was never seen. null is a server reason with no known step.
export type CheckoutIssueTarget = CheckoutStep | "store";

export interface CheckoutIssue {
	target: CheckoutIssueTarget | null;
	message: string;
}

// Keyed by the whole draft, so a new field can't be added without deciding
// where its error shows.
const FIELD_TARGETS: Record<keyof TransactionDraftValues, CheckoutIssueTarget> =
	{
		selectedStoreId: "store",
		customerName: "customer",
		customerPhone: "customer",
		selectedCourierId: "customer",
		productCart: "items",
		itemCart: "items",
		notes: "items",
		selectedCampaignIds: "payment",
		appliedVouchers: "payment",
		selectedPaymentMethodId: "payment",
		manualDiscount: "payment",
	};

// Fix order: a missing Store leaves the payment step with no Campaigns and no
// Store name, so it is always reported first.
const TARGET_ORDER: CheckoutIssueTarget[] = [
	"store",
	"customer",
	"items",
	"payment",
];

// Form errors hang off a list and its entries, and since ADR-0017 Services nest
// inside Items, so a message can sit at any depth.
const firstMessage = (error: unknown): string | undefined => {
	if (!error || typeof error !== "object") {
		return undefined;
	}
	if (
		"message" in error &&
		typeof error.message === "string" &&
		error.message.length > 0
	) {
		return error.message;
	}
	for (const value of Object.values(error)) {
		const nested = firstMessage(value);
		if (nested) {
			return nested;
		}
	}
	return undefined;
};

export const collectCheckoutIssues = (
	errors: FieldErrors<TransactionDraftValues>,
): CheckoutIssue[] => {
	const ordered = TARGET_ORDER.flatMap((target) =>
		Object.entries(FIELD_TARGETS).flatMap(([field, fieldTarget]) => {
			if (fieldTarget !== target) {
				return [];
			}
			const message = firstMessage(
				errors[field as keyof TransactionDraftValues],
			);
			return message ? [{ target, message }] : [];
		}),
	);
	// Keys outside FIELD_TARGETS (RHF's root) would block submit in silence.
	const unmapped = Object.entries(errors).flatMap(([field, error]) => {
		if (field in FIELD_TARGETS) {
			return [];
		}
		const message = firstMessage(error);
		return message ? [{ target: null, message }] : [];
	});
	return [...ordered, ...unmapped];
};

// One line for the footer, which has room for a sentence rather than a list.
export const summarizeCheckoutIssues = (issues: CheckoutIssue[]): string =>
	issues.map((issue) => issue.message).join(" ");

// The server's reasons already name the Product or code at fault; they only
// lack the next move, so it is appended to the reason as sent.
const SERVER_FAILURE_RULES: {
	pattern: RegExp;
	target: CheckoutIssueTarget;
	action: string;
}[] = [
	{
		pattern: /not enough stock/i,
		target: "items",
		action: "Lower the quantity or remove the line.",
	},
	{
		pattern: /campaign can only be applied once/i,
		target: "payment",
		action: "Remove the duplicate campaign.",
	},
	{
		pattern:
			/campaign (not found|.* (is not active|has not started yet|has ended|doesn't run at|has reached its usage limit))|order total does not meet minimum/i,
		target: "payment",
		action: "Remove the campaign or code, or pick another.",
	},
	{
		pattern: /voucher/i,
		target: "payment",
		action: "Remove the code or enter another.",
	},
	{
		pattern: /(product|service) (is not active|not found)/i,
		target: "items",
		action: "Remove the line and re-add it.",
	},
	{
		pattern: /courier isn't active/i,
		target: "customer",
		action: "Pick another courier, or Walk-in.",
	},
	{
		// A typed 0 on a Repair: zero means free on purpose (a Rework), never
		// "not priced yet", which is a blank (ADR-0018).
		pattern: /price must be greater than zero/i,
		target: "items",
		action:
			"Enter the agreed price on the Repair line, or leave it blank until inspection.",
	},
	{
		pattern: /unpriced line/i,
		target: "payment",
		action: "Choose Pay later.",
	},
];

export const describeServerFailure = (message: string): CheckoutIssue => {
	const rule = SERVER_FAILURE_RULES.find((entry) =>
		entry.pattern.test(message),
	);
	if (!rule) {
		// An unknown reason goes through as worded; guessing a step would send
		// the cashier to the wrong place.
		return { target: null, message };
	}
	const reason = /[!.?]$/.test(message) ? message : `${message}.`;
	return { target: rule.target, message: `${reason} ${rule.action}` };
};
