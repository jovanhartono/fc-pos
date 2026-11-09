import { MessageCircleWarningIcon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { COMPLAINT_OUTCOMES } from "@/features/complaints/lib/format";
import type { QualityReport } from "@/features/reports/api";
import {
	DETAIL_CLASS,
	ROW_CLASS,
	shortDay,
} from "@/features/reports/components/worker-sheet";
import { rangeLabel } from "@/features/reports/utils/format";
import { useLeaveSheetLink } from "@/hooks/useLeaveSheetLink";
import { useSheet } from "@/stores/sheet-store";

type ComplaintRow = QualityReport["complaints"][number];

interface ComplaintsListProps {
	complaints: ComplaintRow[];
}

const ComplaintsList = ({ complaints }: ComplaintsListProps) => {
	const leaveSheet = useLeaveSheetLink();
	if (complaints.length === 0) {
		return (
			<EmptyState icon={MessageCircleWarningIcon}>
				No Complaints in range.
			</EmptyState>
		);
	}
	return (
		<ul className="rounded-lg border bg-card px-3">
			{complaints.map((complaint) => (
				<li key={complaint.complaint_id} className={ROW_CLASS}>
					<span className="text-muted-foreground tabular-nums">
						{shortDay(complaint.complained_at)}
					</span>
					<Link
						to="/complaints/$complaintId"
						params={{ complaintId: String(complaint.complaint_id) }}
						onClick={leaveSheet}
						className="text-link tabular-nums"
					>
						{complaint.item_code}
					</Link>
					<span className={DETAIL_CLASS}>
						{[
							complaint.service_name,
							complaint.reason,
							COMPLAINT_OUTCOMES[complaint.outcome].label,
						]
							.filter(Boolean)
							.join(" · ")}
					</span>
				</li>
			))}
		</ul>
	);
};

export const useOpenComplaintsSheet = () => {
	const openSheet = useSheet((s) => s.openSheet);
	return (report: QualityReport) =>
		openSheet({
			title: "Complaints",
			description: rangeLabel(report.from, report.to),
			content: () => <ComplaintsList complaints={report.complaints} />,
		});
};
