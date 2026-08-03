import { DetailedError } from "hono/client";
import type { FieldErrors } from "react-hook-form";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import type { CheckoutStep } from "@/features/transactions/components/checkout-stepper";

// Where the cashier has to go to fix a blocked checkout. "store" is not a
// checkout step — the picker lives in the catalog behind the sheet, which is
// why its FieldError alone was never enough. null means we know what failed but
// not which step owns it (an unrecognized server reason).
export type CheckoutIssueTarget = CheckoutStep | "store";

export interface CheckoutIssue {
	target: CheckoutIssueTarget | null;
	message: string;
}

// Every draft field mapped to the place that owns it. Keyed by the full draft
// type so a new field can't be added without deciding where its error surfaces.
const FIELD_TARGETS: Record<keyof TransactionDraftValues, CheckoutIssueTarget> =
	{
		selectedStoreId: "store",
		customerName: "customer",
		customerPhone: "customer",
		selectedCourierId: "customer",
		productCart: "items",
		serviceCart: "items",
		notes: "items",
		selectedCampaignIds: "payment",
		appliedVouchers: "payment",
		selectedPaymentMethodId: "payment",
		manualDiscount: "payment",
	};

// Fix order, not declaration order: a missing store leaves the payment step with
// no campaigns and no store name, so it is always reported first.
const TARGET_ORDER: CheckoutIssueTarget[] = [
	"store",
	"customer",
	"items",
	"payment",
];

// RHF hangs array errors off both the array itself (superRefine issues) and its
// entries (serviceCart[2].brand), so a message can sit at any depth.
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

// The blocked-submit report: which fields failed, worded as the cashier's next
// move, ordered by where they go to make it.
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

// hono's parseResponse throws a DetailedError whose own message is just the
// status line ("400 Bad Request"); the server's reason rides in detail.data as
// { success: false, message }. Without this unwrap the cashier reads the status.
export const readServerErrorMessage = (
	error: unknown,
	fallback = "Failed to create transaction",
): string => {
	if (error instanceof DetailedError) {
		const detail = error.detail as { data?: { message?: string } } | undefined;
		if (detail?.data?.message) {
			return detail.data.message;
		}
	}
	if (error instanceof Error && error.message.length > 0) {
		return error.message;
	}
	return fallback;
};

// The server's reasons already read well and name the offending product or code;
// what they lack is the next move and the step that owns it. Keep the reason
// verbatim and append the action.
const SERVER_FAILURE_RULES: {
	pattern: RegExp;
	target: CheckoutIssueTarget;
	action: string;
}[] = [
	{
		pattern: /insufficient stock/i,
		target: "items",
		action: "Lower the quantity or remove the line.",
	},
	{
		pattern: /campaign can only be applied once/i,
		target: "payment",
		action: "Remove the duplicate campaign.",
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
		pattern: /active courier/i,
		target: "customer",
		action: "Pick another courier, or Walk-in.",
	},
];

export const describeServerFailure = (message: string): CheckoutIssue => {
	const rule = SERVER_FAILURE_RULES.find((entry) =>
		entry.pattern.test(message),
	);
	if (!rule) {
		// Pass an unrecognized reason through untouched rather than flatten it into
		// something generic — the server's own wording is still the best
		// information we have, and guessing a step would misdirect the fix.
		return { target: null, message };
	}
	// Server reasons arrive unpunctuated, so they need closing before the action is
	// appended, or the two run together into one sentence.
	const reason = /[!.?]$/.test(message) ? message : `${message}.`;
	return { target: rule.target, message: `${reason} ${rule.action}` };
};
