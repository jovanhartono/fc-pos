import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAddReworkMutation } from "@/features/complaints/hooks/useComplaintMutations";
import { getComplaintOutcome } from "@/features/complaints/lib/format";
import { complaintDetailQueryOptions } from "@/lib/query-options";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";

interface DetailProps {
	label: string;
	children: ReactNode;
}

const Detail = ({ label, children }: DetailProps) => (
	<div className="flex flex-col gap-0.5">
		<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
			{label}
		</span>
		<span className="text-sm">{children}</span>
	</div>
);

const ComplaintDetailPage = () => {
	const { complaintId } = Route.useParams();
	const id = Number(complaintId);

	const complaintQuery = useQuery(complaintDetailQueryOptions(id));

	// 0 until data loads; the rework button only renders after the guard below.
	const orderId = complaintQuery.data?.orderService?.order?.id ?? 0;
	const reworkMutation = useAddReworkMutation(id, orderId);

	const detail = complaintQuery.data;

	if (!detail?.orderService?.order) {
		return (
			<>
				<PageHeader title="Complaint" />
				<Card>
					<CardContent className="py-10 text-center text-muted-foreground text-sm">
						{complaintQuery.isPending ? "Loading…" : "Complaint not found"}
					</CardContent>
				</Card>
			</>
		);
	}

	const subject = detail.orderService;
	const order = detail.orderService.order;
	// Refund is the terminal rung (ADR-0013) — rework only while picked_up.
	const canRework = subject.status === "picked_up";
	const outcome = getComplaintOutcome({
		refunded: subject.status === "refunded",
		reworkCount: detail.reworkLines.length,
	});

	return (
		<>
			<PageHeader
				title={`Complaint #${detail.id}`}
				actions={
					canRework ? (
						<Button
							variant="outline"
							onClick={() => reworkMutation.mutate()}
							disabled={reworkMutation.isPending}
							icon={<ArrowClockwiseIcon className="size-4" />}
						>
							Start rework
						</Button>
					) : null
				}
			/>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="flex flex-wrap items-center gap-2">
							Complaint
							<Badge variant={outcome.variant}>{outcome.label}</Badge>
						</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4">
						<div className="grid grid-cols-2 gap-4">
							<Detail label="Order">
								<Link
									to="/orders/$orderId"
									params={{ orderId: String(order.id) }}
									className="font-mono font-semibold"
								>
									{order.code}
								</Link>
							</Detail>
							<Detail label="Store">{order.store?.name ?? "—"}</Detail>
							<Detail label="Customer">{order.customer?.name ?? "—"}</Detail>
							<Detail label="Phone">
								{order.customer?.phone_number ?? "—"}
							</Detail>
						</div>

						<Detail label="Complained item">
							<span className="flex flex-wrap items-center gap-2">
								<span>{subject.service?.name ?? "Service"}</span>
								<span className="font-mono text-muted-foreground text-xs">
									{subject.item_code ?? `#${subject.id}`}
								</span>
								<Badge
									variant={getOrderServiceStatusBadgeVariant(subject.status)}
								>
									{formatOrderServiceStatus(subject.status)}
								</Badge>
							</span>
						</Detail>

						<Detail label="Reason">
							<span className="whitespace-pre-wrap">{detail.reason}</span>
						</Detail>

						<div className="grid grid-cols-2 gap-4">
							<Detail label="Opened by">{detail.openedBy?.name ?? "—"}</Detail>
							<Detail label="Opened at">
								{dayjs(detail.created_at).format("DD MMM YYYY HH:mm")}
							</Detail>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Rework lines ({detail.reworkLines.length})</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-2">
						{detail.reworkLines.length === 0 ? (
							<p className="py-6 text-center text-muted-foreground text-sm">
								No rework started.
							</p>
						) : (
							detail.reworkLines.map((line) => (
								<div
									key={line.id}
									className="flex flex-wrap items-center justify-between gap-2 border p-3"
								>
									<div className="flex flex-col gap-0.5">
										<span className="font-mono text-sm">
											{line.item_code ?? `#${line.id}`}
										</span>
										<span className="text-muted-foreground text-xs">
											{line.service?.name ?? "Service"} ·{" "}
											{line.handler?.name ?? "Unassigned"}
										</span>
									</div>
									<Badge
										variant={getOrderServiceStatusBadgeVariant(line.status)}
									>
										{formatOrderServiceStatus(line.status)}
									</Badge>
								</div>
							))
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
};

export const Route = createFileRoute("/_admin/complaints/$complaintId")({
	loader: async ({ context, params }) => {
		const id = Number(params.complaintId);

		if (!Number.isInteger(id) || id <= 0) {
			return;
		}

		await context.queryClient.ensureQueryData(complaintDetailQueryOptions(id));
	},
	component: ComplaintDetailPage,
});
