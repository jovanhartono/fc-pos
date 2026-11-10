import {
	CancelCircleIcon,
	LinkSquare02Icon,
	MessageCircleWarningIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { MessageRowContent, ROW_TAP, RowLabel } from "@/components/message-row";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COMPLAINT_OUTCOMES } from "@/features/complaints/lib/format";
import { OrderServiceDetail } from "@/features/orders/components/order-service-detail";
import {
	reportsQueries,
	type WorkerDetailReport,
} from "@/features/reports/api";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import { HEAD_CLASS } from "@/features/reports/components/services-by-worker";
import {
	ComplaintsChip,
	QcChip,
} from "@/features/reports/components/tone-chip";
import {
	serviceColor,
	WorkerServicesChart,
} from "@/features/reports/components/worker-services-chart";
import { WorkerName } from "@/features/reports/components/workers-table";
import {
	fixedPercentFormatter,
	numberFormatter,
	oneDecimalFormatter,
	rangeLabel,
} from "@/features/reports/utils/format";
import {
	outOf,
	splitTopServices,
} from "@/features/reports/utils/workers-report";
import { useLeaveSheetLink } from "@/hooks/useLeaveSheetLink";
import { CONTENT_FADE } from "@/lib/content-fade";
import { formatDay } from "@/lib/dayjs";
import { getItemName } from "@/lib/order-service-item-details";
import { cn } from "@/lib/utils";
import { useSheet } from "@/stores/sheet-store";

interface WorkerSheetTarget {
	from: string;
	to: string;
	storeId: number;
	storeName: string;
	userId: number;
	userName: string;
	role: string;
}

// Both the worker sheet and the line sheet opened from it use this, so the
// line sheet's back button can bring the worker sheet up again.
export const useOpenWorkerSheet = () => {
	const openSheet = useSheet((s) => s.openSheet);
	return (target: WorkerSheetTarget) =>
		openSheet({
			title: <WorkerName name={target.userName} role={target.role} />,
			description: `${target.storeName} · ${rangeLabel(target.from, target.to)}`,
			content: () => <WorkerSheetContent target={target} />,
		});
};

interface LineSheetContentProps {
	orderId: number;
	serviceId: number;
}

const LineSheetContent = ({ orderId, serviceId }: LineSheetContentProps) => {
	const leaveSheet = useLeaveSheetLink();
	return (
		<div className="grid gap-4">
			<Button
				variant="outline"
				size="sm"
				className="justify-self-start"
				icon={<HugeiconsIcon icon={LinkSquare02Icon} />}
				render={
					<Link
						to="/orders/$orderId"
						params={{ orderId: String(orderId) }}
						onClick={leaveSheet}
					/>
				}
				nativeButton={false}
			>
				Open Order
			</Button>
			<OrderServiceDetail orderId={orderId} serviceId={serviceId} />
		</div>
	);
};

interface LineSheetItem {
	item_code: string;
	service_name: string | null;
	order_id: number;
	order_service_id: number;
}

// A QC reject opens its line in place, with a way back to the list it came from.
export const useOpenLineSheet = () => {
	const openSheet = useSheet((s) => s.openSheet);
	return (item: LineSheetItem, back: { label: string; onClick: () => void }) =>
		openSheet({
			title: item.item_code,
			description: item.service_name ?? undefined,
			back,
			content: () => (
				<LineSheetContent
					orderId={item.order_id}
					serviceId={item.order_service_id}
				/>
			),
		});
};

interface ServicesTableProps {
	services: WorkerDetailReport["services"];
	topIds: number[];
}

const ServicesTable = ({ services, topIds }: ServicesTableProps) => {
	if (services.length === 0) {
		return (
			<p className="text-muted-foreground text-body">
				Nothing reached QC in range.
			</p>
		);
	}
	const total = services.reduce((sum, s) => sum + s.count, 0);
	return (
		<div className="overflow-auto rounded-lg border bg-card max-h-[26rem]">
			<table className="w-full text-subhead tabular-nums">
				<thead>
					<tr>
						<th scope="col" className={cn(HEAD_CLASS, "text-left")}>
							Service
						</th>
						<th scope="col" className={cn(HEAD_CLASS, "text-right")}>
							Services
						</th>
						<th scope="col" className={cn(HEAD_CLASS, "w-18 text-right")}>
							Share
						</th>
					</tr>
				</thead>
				<tbody>
					{services.map((service) => (
						<tr
							key={service.service_id}
							className="border-border border-t align-top first:border-t-0"
						>
							<td className="px-3 py-1.5">
								<span className="flex items-start gap-2">
									<span
										aria-hidden="true"
										className="mt-1.25 size-2 shrink-0 rounded-full"
										style={{
											backgroundColor: serviceColor(topIds, service.service_id),
										}}
									/>
									{service.service_name}
								</span>
							</td>
							<td className="px-3 py-1.5 text-right">
								{numberFormatter.format(service.count)}
							</td>
							<td className="px-3 py-1.5 text-right text-muted-foreground">
								{fixedPercentFormatter.format(
									total > 0 ? service.count / total : 0,
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};

interface ServiceCardProps {
	name: string;
	chip: React.ReactNode;
	children: React.ReactNode;
}

// The Service heads its own card, as the Item heads the Order's Item card.
const ServiceCard = ({ name, chip, children }: ServiceCardProps) => (
	<div className="rounded-lg border bg-card px-3">
		<div className="flex items-center justify-between gap-3 border-b py-2">
			<p className="font-medium text-body">{name}</p>
			{chip}
		</div>
		<ul className="divide-y">{children}</ul>
	</div>
);

interface RejectCardsProps {
	target: WorkerSheetTarget;
	rejects: WorkerDetailReport["qc_rejects"];
}

const RejectCards = ({ target, rejects }: RejectCardsProps) => {
	const openLineSheet = useOpenLineSheet();
	const openWorkerSheet = useOpenWorkerSheet();
	if (rejects.length === 0) {
		return (
			<EmptyState icon={CancelCircleIcon}>No QC rejects in range.</EmptyState>
		);
	}
	return (
		<div className="grid gap-2.5">
			{rejects.map((service) => (
				<ServiceCard
					key={service.service_id}
					name={service.service_name}
					chip={<QcChip rejects={service.rejects} checks={service.checks} />}
				>
					{service.items.map((item) => (
						<li key={`${item.order_service_id}-${item.rejected_at}`}>
							<button
								type="button"
								onClick={() =>
									openLineSheet(
										{ ...item, service_name: service.service_name },
										{
											label: target.userName,
											onClick: () => openWorkerSheet(target),
										},
									)
								}
								className={ROW_TAP}
							>
								<MessageRowContent
									item={getItemName(item)}
									date={formatDay(item.rejected_at)}
									details={[
										<RowLabel key="rejected" label="Rejected by">
											{item.rejected_by_name}
										</RowLabel>,
									]}
									text={item.note}
								/>
							</button>
						</li>
					))}
				</ServiceCard>
			))}
		</div>
	);
};

interface ComplaintCardsProps {
	complaints: WorkerDetailReport["complaints"];
}

const ComplaintCards = ({ complaints }: ComplaintCardsProps) => {
	const leaveSheet = useLeaveSheetLink();
	if (complaints.length === 0) {
		return (
			<EmptyState icon={MessageCircleWarningIcon}>
				No Complaints in range.
			</EmptyState>
		);
	}
	return (
		<div className="grid gap-2.5">
			{complaints.map((service) => (
				<ServiceCard
					key={service.service_id}
					name={service.service_name}
					chip={
						<ComplaintsChip
							complaints={service.complaints}
							finished={service.finished}
						/>
					}
				>
					{service.items.map((item) => {
						const outcome = COMPLAINT_OUTCOMES[item.outcome];
						return (
							<li key={item.complaint_id}>
								<Link
									to="/complaints/$complaintId"
									params={{ complaintId: String(item.complaint_id) }}
									onClick={leaveSheet}
									className={ROW_TAP}
								>
									<MessageRowContent
										item={getItemName(item)}
										date={formatDay(item.opened_at)}
										lead={`Complaint #${item.complaint_id}`}
										badge={
											<Badge variant={outcome.variant}>{outcome.label}</Badge>
										}
										text={item.reason}
									/>
								</Link>
							</li>
						);
					})}
				</ServiceCard>
			))}
		</div>
	);
};

interface WorkerSheetContentProps {
	target: WorkerSheetTarget;
}

const FACT_LABELS = ["Days worked", "Services", "Per day worked", "QC rejects"];

const WorkerSheetContent = ({ target }: WorkerSheetContentProps) => {
	const query = useQuery(
		reportsQueries.workerDetail({
			from: target.from,
			to: target.to,
			store_id: target.storeId,
			user_id: target.userId,
		}),
	);
	const data = query.data;

	// The real tiles, headings and chart frame with bars for the numbers, so
	// nothing in the sheet moves when the worker's numbers land.
	if (query.isPending) {
		return (
			<div aria-hidden className="grid gap-5">
				<KpiRow isPending>
					{FACT_LABELS.map((label) => (
						<KpiCard key={label} label={label} value={null} />
					))}
				</KpiRow>
				<Section title="Services Each Day">
					<Skeleton className="h-69 w-full" />
				</Section>
				<Section title="Services Worked">
					<Skeleton className="h-40 w-full rounded-lg" />
				</Section>
			</div>
		);
	}
	if (!data) {
		return (
			<div className="flex items-center gap-3 text-muted-foreground text-body">
				Couldn't load this worker.
				<Button variant="outline" size="sm" onClick={() => query.refetch()}>
					Retry
				</Button>
			</div>
		);
	}

	const { facts } = data;
	const { top } = splitTopServices(data.services);
	const topIds = top.map((s) => s.service_id);

	return (
		<div className={cn("grid gap-5", CONTENT_FADE)}>
			<KpiRow>
				<KpiCard
					label="Days worked"
					value={numberFormatter.format(facts.days_worked)}
				/>
				<KpiCard
					label="Services"
					value={numberFormatter.format(facts.services_processed)}
				/>
				<KpiCard
					label="Per day worked"
					value={
						facts.per_day_worked === null
							? "—"
							: oneDecimalFormatter.format(facts.per_day_worked)
					}
				/>
				<KpiCard
					label="QC rejects"
					value={outOf(facts.qc_rejects, facts.qc_checks)}
				/>
			</KpiRow>

			<Section title="Services Each Day">
				<WorkerServicesChart data={data} topIds={topIds} />
			</Section>

			<Section title="Services Worked">
				<ServicesTable services={data.services} topIds={topIds} />
			</Section>

			<Section
				title="QC Rejects by Service"
				count={numberFormatter.format(facts.qc_rejects)}
			>
				<RejectCards target={target} rejects={data.qc_rejects} />
			</Section>

			<Section
				title="Complaints by Service"
				count={numberFormatter.format(facts.complaints)}
			>
				<ComplaintCards complaints={data.complaints} />
			</Section>
		</div>
	);
};
