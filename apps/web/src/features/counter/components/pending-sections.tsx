import {
	CancelCircleIcon,
	MessageCircleWarningIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { Section } from "@/components/section";
import type { CounterComplaint, CounterQcReject } from "@/features/counter/api";
import { formatDays } from "@/features/counter/lib/format";
import { OrderListRow } from "@/features/orders/components/order-list-row";
import { pluralize } from "@/shared/utils";

const ROW_CLASS = "rounded-none px-3 tabular-nums";

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
			<ul className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
				{children}
			</ul>
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
				<OrderListRow
					className={ROW_CLASS}
					details={[complaint.category, complaint.reason]}
					end={
						<span className="text-subhead">{formatDays(complaint.days)}</span>
					}
					params={{ complaintId: String(complaint.complaint_id) }}
					title={complaint.item_code}
					to="/complaints/$complaintId"
				/>
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
				<OrderListRow
					className={ROW_CLASS}
					details={[reject.category, reject.note]}
					end={<span className="text-subhead">{formatDays(reject.days)}</span>}
					params={{
						orderId: reject.order_id,
						serviceId: reject.order_service_id,
					}}
					title={reject.item_code}
					to="/queue/$orderId/$serviceId"
				/>
			</li>
		))}
	</PendingSection>
);
