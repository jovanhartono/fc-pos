import { getOrderServiceItemDescriptors } from "@/lib/order-service-item-details";
import type { BadgeVariant } from "@/lib/status";

interface ComplaintItemFields {
	order_code: string;
	item_code: string;
	item_brand: string | null;
	item_model: string | null;
	item_color: string | null;
}

export const getComplaintItemTag = ({
	order_code,
	item_code,
}: Pick<ComplaintItemFields, "order_code" | "item_code">): string => {
	const orderPrefix = `${order_code}-`;
	return item_code.startsWith(orderPrefix)
		? item_code.slice(orderPrefix.length)
		: item_code;
};

export const getComplaintItemName = ({
	item_brand,
	item_model,
	item_color,
}: Pick<ComplaintItemFields, "item_brand" | "item_model" | "item_color">):
	| string
	| null =>
	getOrderServiceItemDescriptors({
		brand: item_brand,
		model: item_model,
		color: item_color,
	}).join(" ") || null;

// One Order can carry Complaints on several Items, so the tag and descriptors
// tell rows apart; the Order code is already on the line above, as on the Queue card.
export const formatComplaintItem = (fields: ComplaintItemFields): string => {
	const tag = getComplaintItemTag(fields);
	const name = getComplaintItemName(fields);
	return name ? `${tag} · ${name}` : tag;
};

// The Complaint carries no stored status (ADR-0013 amendment) — its outcome is
// derived from the lines: refunded or cancelled if the original line was,
// reworked if a rework that was not cancelled points back, else pending.
interface ComplaintOutcomeInput {
	subjectStatus: string;
	reworkCount: number;
}

interface ComplaintOutcome {
	label: string;
	variant: BadgeVariant;
}

export const getComplaintOutcome = ({
	subjectStatus,
	reworkCount,
}: ComplaintOutcomeInput): ComplaintOutcome => {
	if (subjectStatus === "refunded") {
		return { label: "Refunded", variant: "danger" };
	}
	// Turned down at the counter on an unpaid Order and cancelled, not reworked.
	if (subjectStatus === "cancelled") {
		return { label: "Cancelled", variant: "danger" };
	}
	if (reworkCount > 0) {
		return { label: "Reworked", variant: "success" };
	}
	return { label: "Pending", variant: "warning" };
};
