import { CaretRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Section } from "@/components/section";
import type { CounterComplaint, CounterQcReject } from "@/features/counter/api";
import { formatDays } from "@/features/counter/lib/format";
import { pluralize } from "@/shared/utils";

interface LookRowBodyProps {
	code: string;
	days: number;
	why?: string;
}

const LookRowBody = ({ code, days, why }: LookRowBodyProps) => (
	<>
		<span className="grid min-w-0 gap-0.5">
			<span className="flex items-baseline justify-between gap-3">
				<span className="min-w-0 break-all font-medium text-body tabular-nums">
					{code}
				</span>
				<span className="shrink-0 text-subhead tabular-nums">
					{formatDays(days)}
				</span>
			</span>
			{why ? (
				<span className="text-muted-foreground text-subhead">{why}</span>
			) : null}
		</span>
		<CaretRightIcon
			aria-hidden="true"
			className="size-3.5 shrink-0 text-muted-foreground/50"
		/>
	</>
);

const rowClass =
	"grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none";

interface PendingSectionProps {
	children: ReactNode;
	count: string | null;
	empty: string;
	title: string;
}

const PendingSection = ({
	children,
	count,
	empty,
	title,
}: PendingSectionProps) => (
	<Section count={count} empty={empty} title={title}>
		{count ? (
			<ul className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
				{children}
			</ul>
		) : null}
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
		title="Pending Complaints"
	>
		{complaints.map((complaint) => (
			<li key={complaint.complaint_id}>
				<Link
					className={rowClass}
					params={{ complaintId: String(complaint.complaint_id) }}
					to="/complaints/$complaintId"
				>
					<LookRowBody
						code={complaint.item_code}
						days={complaint.days}
						why={[complaint.category, complaint.reason]
							.filter(Boolean)
							.join(" · ")}
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
		title="Pending QC Rejects"
	>
		{rejects.map((reject) => (
			<li key={reject.order_service_id}>
				<Link
					className={rowClass}
					params={{
						orderId: reject.order_id,
						serviceId: reject.order_service_id,
					}}
					to="/queue/$orderId/$serviceId"
				>
					<LookRowBody
						code={reject.item_code}
						days={reject.days}
						why={[reject.category, reject.note].filter(Boolean).join(" · ")}
					/>
				</Link>
			</li>
		))}
	</PendingSection>
);
