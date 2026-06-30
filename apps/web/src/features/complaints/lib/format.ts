import type { BadgeVariant } from "@/lib/status";

// The Complaint carries no stored status (ADR-0013 amendment) — its outcome is
// derived from the lines: refunded if the original line was refunded, reworked
// if any rework line points back, else pending.
interface ComplaintOutcomeInput {
	refunded: boolean;
	reworkCount: number;
}

interface ComplaintOutcome {
	label: string;
	variant: BadgeVariant;
}

export const getComplaintOutcome = ({
	refunded,
	reworkCount,
}: ComplaintOutcomeInput): ComplaintOutcome => {
	if (refunded) {
		return { label: "Refunded", variant: "danger" };
	}
	if (reworkCount > 0) {
		return { label: "Reworked", variant: "success" };
	}
	return { label: "Pending", variant: "warning" };
};
