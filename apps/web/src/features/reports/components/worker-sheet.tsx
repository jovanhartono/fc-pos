import {
	CancelCircleIcon,
	LinkSquare02Icon,
	MessageCircleWarningIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";
import { EmptyState } from "@/components/empty-state";
import { Section } from "@/components/section";
import { TextSkeleton } from "@/components/text-skeleton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderServiceDetail } from "@/features/orders/components/order-service-detail";
import {
	reportsQueries,
	type WorkerDetailReport,
} from "@/features/reports/api";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
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
} from "@/features/reports/utils/format";
import {
	outOf,
	splitTopServices,
} from "@/features/reports/utils/workers-report";
import { useLeaveSheetLink } from "@/hooks/useLeaveSheetLink";
import { CONTENT_FADE } from "@/lib/content-fade";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { pluralize } from "@/shared/utils";
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

export const sheetRangeLabel = (from: string, to: string) =>
	from === to
		? dayjs(to).format("D MMM YYYY")
		: `${dayjs(from).format("D MMM")} – ${dayjs(to).format("D MMM YYYY")}`;

export const shortDay = (value: string) =>
	dayjs(value).tz(JAKARTA_TZ).format("D MMM");

// Both the worker sheet and the line sheet opened from it use this, so the
// line sheet's back button can bring the worker sheet up again.
export const useOpenWorkerSheet = () => {
	const openSheet = useSheet((s) => s.openSheet);
	return useCallback(
		(target: WorkerSheetTarget) =>
			openSheet({
				title: <WorkerName name={target.userName} role={target.role} />,
				description: `${target.storeName} · ${sheetRangeLabel(target.from, target.to)}`,
				size: "wide",
				content: () => <WorkerSheetContent target={target} />,
			}),
		[openSheet],
	);
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
		<div className="overflow-hidden rounded-lg border bg-card">
			<table className="w-full text-subhead tabular-nums">
				<thead className="text-muted-foreground">
					<tr>
						<th scope="col" className="px-3 py-2 text-left font-medium">
							Service
						</th>
						<th scope="col" className="px-3 py-2 text-right font-medium">
							Services
						</th>
						<th scope="col" className="w-18 px-3 py-2 text-right font-medium">
							Share
						</th>
					</tr>
				</thead>
				<tbody>
					{services.map((service) => (
						<tr
							key={service.service_id}
							className="border-border border-t align-top"
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

const ServiceCard = ({ name, chip, children }: ServiceCardProps) => (
	<div>
		<div className="flex items-center justify-between gap-3 border-border border-b py-2">
			<p className="font-medium text-body">{name}</p>
			{chip}
		</div>
		<ul>{children}</ul>
	</div>
);

export const ROW_CLASS =
	"grid grid-cols-[3.5rem_auto_1fr] items-baseline gap-x-3 border-border py-2 text-body not-first:border-t max-sm:grid-cols-[3.5rem_1fr]";
export const DETAIL_CLASS = "text-muted-foreground max-sm:col-start-2";

interface RejectCardsProps {
	target: WorkerSheetTarget;
	rejects: WorkerDetailReport["qc_rejects"];
}

const RejectCards = ({ target, rejects }: RejectCardsProps) => {
	const openSheet = useSheet((s) => s.openSheet);
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
						<li
							key={`${item.order_service_id}-${item.rejected_at}`}
							className={ROW_CLASS}
						>
							<span className="text-muted-foreground tabular-nums">
								{shortDay(item.rejected_at)}
							</span>
							<button
								type="button"
								onClick={() =>
									openSheet({
										title: item.item_code,
										description: service.service_name,
										back: {
											label: target.userName,
											onClick: () => openWorkerSheet(target),
										},
										content: () => (
											<LineSheetContent
												orderId={item.order_id}
												serviceId={item.order_service_id}
											/>
										),
									})
								}
								className="justify-self-start text-left text-link tabular-nums"
							>
								{item.item_code}
							</button>
							<span className={DETAIL_CLASS}>{item.note || "–"}</span>
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
					{service.items.map((item) => (
						<li key={item.complaint_id} className={ROW_CLASS}>
							<span className="text-muted-foreground tabular-nums">
								{shortDay(item.opened_at)}
							</span>
							<Link
								to="/complaints/$complaintId"
								params={{ complaintId: String(item.complaint_id) }}
								onClick={leaveSheet}
								className="text-link tabular-nums"
							>
								{item.item_code}
							</Link>
							<span className={DETAIL_CLASS}>{item.reason}</span>
						</li>
					))}
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
					<Skeleton className="h-64 w-full" />
				</Section>
				<Section
					title="Services Worked"
					count={<TextSkeleton className="w-28" />}
				>
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

			<Section
				title="Services Worked"
				count={`${numberFormatter.format(facts.services_processed)} in ${pluralize(data.services.length, "Service")}`}
			>
				<ServicesTable services={data.services} topIds={topIds} />
			</Section>

			<Section
				title="QC Rejects by Service"
				count={`${outOf(facts.qc_rejects, facts.qc_checks)} checks`}
			>
				<RejectCards target={target} rejects={data.qc_rejects} />
			</Section>

			<Section
				title="Complaints by Service"
				count={`${outOf(facts.complaints, facts.complaint_cohort)} finished`}
			>
				<ComplaintCards complaints={data.complaints} />
			</Section>
		</div>
	);
};
