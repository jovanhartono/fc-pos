import type { BadgeVariant } from "@/lib/status";

// The Complaint carries no stored status (ADR-0013 amendment) — its outcome is
// derived from the lines: refunded or cancelled if the original line was,
// reworked if any rework line points back, else pending.
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
	// A pair turned down at the counter on an unpaid Order, and the cashier
	// cancelled the line instead of reworking it.
	if (subjectStatus === "cancelled") {
		return { label: "Cancelled", variant: "danger" };
	}
	if (reworkCount > 0) {
		return { label: "Reworked", variant: "success" };
	}
	return { label: "Pending", variant: "warning" };
};
