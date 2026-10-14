import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type {
	Counter,
	CounterComplaint,
	CounterQcReject,
	CounterStuckItem,
} from "@/features/counter/api";
import { formatDays } from "@/features/counter/lib/format";
import { pluralize } from "@/shared/utils";

const MAX_STUCK_ROWS = 5;

interface LookCardProps {
	chip: string;
	children: ReactNode;
	title: string;
}

const LookCard = ({ chip, children, title }: LookCardProps) => (
	<div className="border border-border">
		<div className="flex items-center justify-between gap-3 border-border border-b bg-muted/40 px-3 py-2">
			<h3 className="font-medium">{title}</h3>
			<span className="bg-warning/15 px-1.5 text-foreground text-xs tabular-nums whitespace-nowrap">
				{chip}
			</span>
		</div>
		<ul>{children}</ul>
	</div>
);

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

interface QueueCodeProps {
	item: Pick<CounterStuckItem, "item_code" | "order_id" | "order_service_id">;
}

const QueueCode = ({ item }: QueueCodeProps) => (
	<Link
		className={codeClass}
		params={{
			orderId: item.order_id,
			serviceId: item.order_service_id,
		}}
		to="/queue/$orderId/$serviceId"
	>
		{item.item_code}
	</Link>
);

interface QcRejectsCardProps {
	rejects: CounterQcReject[];
}

const QcRejectsCard = ({ rejects }: QcRejectsCardProps) => (
	<LookCard
		chip={pluralize(
			new Set(rejects.map((reject) => reject.item_code)).size,
			"Item",
		)}
		title="QC rejects waiting"
	>
		{rejects.map((reject) => (
			<LookRow
				code={<QueueCode item={reject} />}
				days={reject.days}
				key={reject.order_service_id}
				why={[reject.category, reject.note].filter(Boolean).join(" · ")}
			/>
		))}
	</LookCard>
);

interface ComplaintsCardProps {
	complaints: CounterComplaint[];
}

const ComplaintsCard = ({ complaints }: ComplaintsCardProps) => (
	<LookCard
		chip={pluralize(complaints.length, "Complaint")}
		title="Complaints not decided"
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
	</LookCard>
);

interface StuckCardProps {
	category: string;
	items: CounterStuckItem[];
}

const StuckCard = ({ category, items }: StuckCardProps) => (
	<LookCard
		chip={pluralize(items.length, "Item")}
		title={`Stuck · ${category}`}
	>
		{items.slice(0, MAX_STUCK_ROWS).map((item) => (
			<LookRow
				code={<QueueCode item={item} />}
				days={item.waiting_days}
				key={item.order_service_id}
				why={`${item.newer_started} newer went first`}
			/>
		))}
		{items.length > MAX_STUCK_ROWS ? (
			<li className="border-border border-t px-3 py-2 text-[13.5px] text-muted-foreground">
				+{items.length - MAX_STUCK_ROWS} more
			</li>
		) : null}
	</LookCard>
);

const stuckByCategory = (stuck: CounterStuckItem[]) => {
	const groups = new Map<string, CounterStuckItem[]>();
	for (const item of stuck) {
		const group = groups.get(item.category);
		if (group) {
			group.push(item);
		} else {
			groups.set(item.category, [item]);
		}
	}
	return [...groups.entries()];
};

interface NeedsALookSectionProps {
	counter: Counter;
}

export const NeedsALookSection = ({ counter }: NeedsALookSectionProps) => {
	const stuckGroups = stuckByCategory(counter.stuck);
	const isEmpty =
		counter.qc_rejects.length === 0 &&
		counter.complaints.length === 0 &&
		stuckGroups.length === 0;

	return (
		<section className="grid gap-2.5">
			<h2 className="font-medium text-[15px]">Needs a look</h2>
			{isEmpty ? (
				<p className="text-muted-foreground">Nothing needs a look.</p>
			) : (
				<div className="grid gap-2.5">
					{counter.qc_rejects.length > 0 ? (
						<QcRejectsCard rejects={counter.qc_rejects} />
					) : null}
					{counter.complaints.length > 0 ? (
						<ComplaintsCard complaints={counter.complaints} />
					) : null}
					{stuckGroups.map(([category, items]) => (
						<StuckCard category={category} items={items} key={category} />
					))}
				</div>
			)}
		</section>
	);
};
