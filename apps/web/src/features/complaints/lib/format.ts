import { getOrderServiceItemDescriptors } from "@/lib/order-service-item-details";
import type { BadgeVariant } from "@/lib/status";

interface ComplaintItemFields {
	item_code: string;
	item_brand: string | null;
	item_model: string | null;
	item_color: string | null;
}

// One Order can carry Complaints on several Items; the tag and descriptors are
// what tell the rows apart.
export const formatComplaintItem = ({
	item_code,
	item_brand,
	item_model,
	item_color,
}: ComplaintItemFields): string => {
	const descriptors = getOrderServiceItemDescriptors({
		brand: item_brand,
		model: item_model,
		color: item_color,
	}).join(" ");
	return descriptors ? `${item_code} · ${descriptors}` : item_code;
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
