import { MessageCircleWarningIcon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { MessageRowContent, ROW_TAP } from "@/components/message-row";
import { Badge } from "@/components/ui/badge";
import { COMPLAINT_OUTCOMES } from "@/features/complaints/lib/format";
import type { QualityReport } from "@/features/reports/api";
import { rangeLabel } from "@/features/reports/utils/format";
import { useLeaveSheetLink } from "@/hooks/useLeaveSheetLink";
import { formatDay } from "@/lib/dayjs";
import { getItemName } from "@/lib/order-service-item-details";
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
		<ul className="divide-y rounded-lg border bg-card px-3">
			{complaints.map((complaint) => {
				const outcome = COMPLAINT_OUTCOMES[complaint.outcome];
				return (
					<li key={complaint.complaint_id}>
						<Link
							to="/complaints/$complaintId"
							params={{ complaintId: String(complaint.complaint_id) }}
							onClick={leaveSheet}
							className={ROW_TAP}
						>
							<MessageRowContent
								item={getItemName(complaint)}
								date={formatDay(complaint.complained_at)}
								lead={`Complaint #${complaint.complaint_id}`}
								details={[complaint.service_name]}
								badge={<Badge variant={outcome.variant}>{outcome.label}</Badge>}
								text={complaint.reason}
							/>
						</Link>
					</li>
				);
			})}
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
