import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { CounterComplaint, CounterQcReject } from "@/features/counter/api";
import { formatDays } from "@/features/counter/lib/format";
import { pluralize } from "@/shared/utils";

interface LookRowProps {
	code: ReactNode;
	days: number;
	why?: string;
}

// Phone: code and days share the first line and the reason wraps below.
const LookRow = ({ code, days, why }: LookRowProps) => (
	<li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-border border-t px-3 py-2 text-[13.5px] first:border-t-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
		{code}
		<span className="text-right tabular-nums sm:order-last">
			{formatDays(days)}
		</span>
		{why ? (
			<span className="col-span-full text-muted-foreground sm:col-span-1">
				{why}
			</span>
		) : null}
	</li>
);

const codeClass =
	"justify-self-start font-mono text-xs underline underline-offset-2";

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
	<section className="grid gap-2.5">
		<h2 className="font-medium text-[15px]">
			{title}
			{count ? (
				<span className="font-normal text-muted-foreground tabular-nums">
					{" "}
					· {count}
				</span>
			) : null}
		</h2>
		{count ? (
			<ul className="border border-border">{children}</ul>
		) : (
			<p className="text-muted-foreground">{empty}</p>
		)}
	</section>
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
			<LookRow
				code={
					<Link
						className={codeClass}
						params={{ complaintId: String(complaint.complaint_id) }}
						to="/complaints/$complaintId"
					>
						{complaint.item_code}
					</Link>
				}
				days={complaint.days}
				key={complaint.complaint_id}
				why={[complaint.category, complaint.reason].filter(Boolean).join(" · ")}
			/>
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
			<LookRow
				code={
					<Link
						className={codeClass}
						params={{
							orderId: reject.order_id,
							serviceId: reject.order_service_id,
						}}
						to="/queue/$orderId/$serviceId"
					>
						{reject.item_code}
					</Link>
				}
				days={reject.days}
				key={reject.order_service_id}
				why={[reject.category, reject.note].filter(Boolean).join(" · ")}
			/>
		))}
	</PendingSection>
);
