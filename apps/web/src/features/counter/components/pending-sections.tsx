import {
	CancelCircleIcon,
	MessageCircleWarningIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { MessageRowContent, ROW_TAP } from "@/components/message-row";
import { Section } from "@/components/section";
import type { CounterComplaint, CounterQcReject } from "@/features/counter/api";
import { formatDays } from "@/features/counter/lib/format";
import { getItemName } from "@/lib/order-service-item-details";
import { pluralize } from "@/shared/utils";

interface PendingSectionProps {
	children: ReactNode;
	count: string | null;
	empty: string;
	emptyIcon: IconSvgElement;
	title: string;
}

const PendingSection = ({
	children,
	count,
	empty,
	emptyIcon,
	title,
}: PendingSectionProps) => (
	<Section count={count} title={title}>
		{count ? (
			<ul className="divide-y rounded-lg border bg-card px-3">{children}</ul>
		) : (
			<EmptyState icon={emptyIcon}>{empty}</EmptyState>
		)}
	</Section>
);

interface PendingComplaintsSectionProps {
	complaints: CounterComplaint[];
}

export const PendingComplaintsSection = ({
	complaints,
}: PendingComplaintsSectionProps) => (
	<PendingSection
		count={
			complaints.length > 0 ? pluralize(complaints.length, "Complaint") : null
		}
		empty="No pending Complaints."
		emptyIcon={MessageCircleWarningIcon}
		title="Pending Complaints"
	>
		{complaints.map((complaint) => (
			<li key={complaint.complaint_id}>
				<Link
					className={ROW_TAP}
					params={{ complaintId: String(complaint.complaint_id) }}
					to="/complaints/$complaintId"
				>
					<MessageRowContent
						date={formatDays(complaint.days)}
						details={[complaint.category]}
						item={getItemName(complaint)}
						lead={`Complaint #${complaint.complaint_id}`}
						text={complaint.reason}
					/>
				</Link>
			</li>
		))}
	</PendingSection>
);

interface PendingQcRejectsSectionProps {
	rejects: CounterQcReject[];
}

export const PendingQcRejectsSection = ({
	rejects,
}: PendingQcRejectsSectionProps) => (
	<PendingSection
		count={
			rejects.length > 0
				? pluralize(
						new Set(rejects.map((reject) => reject.item_code)).size,
						"Item",
					)
				: null
		}
		empty="No pending QC Rejects."
		emptyIcon={CancelCircleIcon}
		title="Pending QC Rejects"
	>
		{rejects.map((reject) => (
			<li key={reject.order_service_id}>
				<Link
					className={ROW_TAP}
					params={{
						orderId: reject.order_id,
						serviceId: reject.order_service_id,
					}}
					to="/queue/$orderId/$serviceId"
				>
					<MessageRowContent
						date={formatDays(reject.days)}
						details={[reject.category]}
						item={getItemName(reject)}
						text={reject.note}
					/>
				</Link>
			</li>
		))}
	</PendingSection>
);
