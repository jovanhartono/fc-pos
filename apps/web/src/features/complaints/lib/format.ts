import {
	type ComplaintOutcome as ComplaintOutcomeKey,
	complaintOutcome,
} from "@fresclean/api/rules";
import type { ItemNameFields } from "@fresclean/api/types";
import { getRowItemDetails } from "@/lib/order-service-item-details";
import type { BadgeVariant } from "@/lib/status";

interface ComplaintItemFields extends ItemNameFields {
	order_code: string;
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

// One Order can carry Complaints on several Items, so the tag and descriptors
// tell rows apart; the Order code is already on the line above, as on the Queue card.
export const formatComplaintItem = (fields: ComplaintItemFields): string => {
	const tag = getComplaintItemTag(fields);
	const name = getRowItemDetails(fields);
	return name ? `${tag} · ${name}` : tag;
};

interface ComplaintOutcome {
	label: string;
	variant: BadgeVariant;
}

export const COMPLAINT_OUTCOMES = {
	refunded: { label: "Refunded", variant: "danger" },
	cancelled: { label: "Cancelled", variant: "danger" },
	reworked: { label: "Reworked", variant: "success" },
	pending: { label: "Pending", variant: "warning" },
} satisfies Record<ComplaintOutcomeKey, ComplaintOutcome>;

export const getComplaintOutcome = (
	lines: Parameters<typeof complaintOutcome>[0],
): ComplaintOutcome => COMPLAINT_OUTCOMES[complaintOutcome(lines)];
