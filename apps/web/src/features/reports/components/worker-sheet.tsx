import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { OrderServiceDetail } from "@/features/orders/components/order-service-detail";
import {
	reportsQueries,
	type WorkerDetailReport,
} from "@/features/reports/api";
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
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";
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

const sheetRangeLabel = (from: string, to: string) =>
	from === to
		? dayjs(to).format("D MMM YYYY")
		: `${dayjs(from).format("D MMM")} – ${dayjs(to).format("D MMM YYYY")}`;

const shortDay = (value: string) => dayjs(value).tz(JAKARTA_TZ).format("D MMM");

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
	const closeSheet = useSheet((s) => s.closeSheet);
	return (
		<div className="grid gap-4">
			<Button
				variant="outline"
				size="sm"
				className="justify-self-start"
				icon={<ArrowSquareOutIcon className="size-4" />}
				render={
					<Link
						to="/orders/$orderId"
						params={{ orderId: String(orderId) }}
						onClick={closeSheet}
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

interface FactProps {
	label: string;
	value: string;
}

const Fact = ({ label, value }: FactProps) => (
	<div className="border border-border px-2.5 py-2">
		<p className="font-semibold text-lg tabular-nums">{value}</p>
		<p className="text-muted-foreground text-xs">{label}</p>
	</div>
);

interface SheetSectionProps {
	title: string;
	count?: string;
	children: React.ReactNode;
}

const SheetSection = ({ title, count, children }: SheetSectionProps) => (
	<section className="grid gap-2">
		<h3 className="font-semibold text-sm">
			{title}
			{count ? (
				<span className="font-normal text-muted-foreground">{` · ${count}`}</span>
			) : null}
		</h3>
		{children}
	</section>
);

interface ServicesTableProps {
	services: WorkerDetailReport["services"];
	topIds: number[];
}

const ServicesTable = ({ services, topIds }: ServicesTableProps) => {
	if (services.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Nothing reached QC in range.
			</p>
		);
	}
	const total = services.reduce((sum, s) => sum + s.count, 0);
	return (
		<div className="max-h-88 overflow-y-auto border border-border">
			<table className="w-full text-sm tabular-nums">
				<thead className="sticky top-0 z-10 bg-muted text-muted-foreground text-xs">
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
										className="mt-1.25 size-2.5 shrink-0"
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
	<div className="border border-border">
		<div className="flex items-center justify-between gap-3 border-border border-b bg-muted/40 px-3 py-2.5">
			<p className="font-medium text-sm">{name}</p>
			{chip}
		</div>
		<ul>{children}</ul>
	</div>
);

const ROW_CLASS =
	"grid grid-cols-[3.5rem_auto_1fr] items-baseline gap-x-3 border-border px-3 py-2 text-sm not-first:border-t max-sm:grid-cols-[3.5rem_1fr]";
const DETAIL_CLASS = "text-muted-foreground max-sm:col-start-2";

interface RejectCardsProps {
	target: WorkerSheetTarget;
	rejects: WorkerDetailReport["qc_rejects"];
}

const RejectCards = ({ target, rejects }: RejectCardsProps) => {
	const openSheet = useSheet((s) => s.openSheet);
	const openWorkerSheet = useOpenWorkerSheet();
	if (rejects.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No QC rejects in range.</p>
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
								className="font-mono underline underline-offset-2"
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
	const closeSheet = useSheet((s) => s.closeSheet);
	if (complaints.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No Complaints in range.</p>
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
								onClick={closeSheet}
								className="font-mono underline underline-offset-2"
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

	if (query.isPending) {
		return (
			<div className="grid gap-4">
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{Array.from({ length: 4 }, (_, index) => (
						<div key={index} className="h-16 animate-pulse bg-muted/40" />
					))}
				</div>
				<div className="h-64 animate-pulse bg-muted/40" />
			</div>
		);
	}
	if (!data) {
		return (
			<div className="flex items-center gap-3 text-muted-foreground text-sm">
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
		<div className="grid gap-5">
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<Fact
					label="Days worked"
					value={numberFormatter.format(facts.days_worked)}
				/>
				<Fact
					label="Services"
					value={numberFormatter.format(facts.services_processed)}
				/>
				<Fact
					label="Per day worked"
					value={
						facts.per_day_worked === null
							? "—"
							: oneDecimalFormatter.format(facts.per_day_worked)
					}
				/>
				<Fact
					label="QC rejects"
					value={outOf(facts.qc_rejects, facts.qc_checks)}
				/>
			</div>

			<SheetSection title="Services each day">
				<WorkerServicesChart data={data} topIds={topIds} />
			</SheetSection>

			<SheetSection
				title="Services worked"
				count={`${numberFormatter.format(facts.services_processed)} in ${pluralize(data.services.length, "Service")}`}
			>
				<ServicesTable services={data.services} topIds={topIds} />
			</SheetSection>

			<SheetSection
				title="QC rejects by Service"
				count={`${outOf(facts.qc_rejects, facts.qc_checks)} checks`}
			>
				<RejectCards target={target} rejects={data.qc_rejects} />
			</SheetSection>

			<SheetSection
				title="Complaints by Service"
				count={`${outOf(facts.complaints, facts.complaint_cohort)} finished`}
			>
				<ComplaintCards complaints={data.complaints} />
			</SheetSection>
		</div>
	);
};
