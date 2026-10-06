import { isInWorkshop, isReworkedRound } from "@fresclean/api/schema";
import { ArrowClockwiseIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { complaintsQueries } from "@/features/complaints/api";
import { useAddReworkMutation } from "@/features/complaints/hooks/useComplaintMutations";
import { getComplaintOutcome } from "@/features/complaints/lib/format";
import { CustomerLink } from "@/features/customers/components/customer-link";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { useDialog } from "@/stores/dialog-store";

interface FactProps {
	label: string;
	children: ReactNode;
}

const Fact = ({ label, children }: FactProps) => (
	<div className="grid min-w-0 content-start gap-0.5">
		<dt className="text-muted-foreground text-xs">{label}</dt>
		<dd className="grid min-w-0 gap-0.5 text-sm">{children}</dd>
	</div>
);

const ComplaintDetailPage = () => {
	const { complaintId } = Route.useParams();
	const id = Number(complaintId);

	const complaintQuery = useQuery(complaintsQueries.detail(id));

	// 0 until data loads; the rework button only renders after the guard below.
	const reworkMutation = useAddReworkMutation(id);
	const openDialog = useDialog((state) => state.openDialog);
	const closeDialog = useDialog((state) => state.closeDialog);

	const detail = complaintQuery.data;

	if (!detail?.orderService?.order) {
		return (
			<>
				<PageHeader title="Complaint" />
				<p className="py-10 text-center text-muted-foreground text-sm">
					{complaintQuery.isPending ? "Loading…" : "Complaint not found"}
				</p>
			</>
		);
	}

	const subject = detail.orderService;
	const order = detail.orderService.order;
	// Refund is the terminal rung (ADR-0013), and a Complaint runs one round at
	// a time.
	const isFinished =
		subject.status === "ready_for_pickup" || subject.status === "picked_up";
	const roundIndex = detail.reworkLines.findIndex(isInWorkshop);
	const roundInWorkshop = detail.reworkLines[roundIndex];
	const canRework = isFinished && roundInWorkshop === undefined;
	const reworkWaitReason =
		isFinished && roundInWorkshop
			? `Round ${roundIndex + 1} is still in the workshop, so the next one waits.`
			: undefined;
	const outcome = getComplaintOutcome({
		subjectStatus: subject.status,
		reworkCount: detail.reworkLines.filter(isReworkedRound).length,
	});
	const descriptors = getOrderServiceItemDetails(subject.item);
	const serviceName = subject.service?.name ?? "Service";

	return (
		<>
			<PageHeader
				title={`Complaint #${detail.id}`}
				description={reworkWaitReason}
				actions={
					canRework ? (
						<Button
							variant="outline"
							disabled={reworkMutation.isPending}
							icon={<ArrowClockwiseIcon className="size-4" />}
							onClick={() =>
								openDialog({
									title: "Start a rework?",
									description: `${serviceName} on ${subject.item.item_code} goes back on the rack at no charge.`,
									footer: () => (
										<>
											<Button variant="outline" onClick={closeDialog}>
												Cancel
											</Button>
											<Button
												onClick={() => {
													closeDialog();
													reworkMutation.mutate();
												}}
											>
												Start rework
											</Button>
										</>
									),
								})
							}
						>
							Start rework
						</Button>
					) : null
				}
			/>

			<div className="grid gap-8">
				<section className="grid gap-3">
					<p className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
						<Badge variant={outcome.variant}>{outcome.label}</Badge>
						<span>
							Opened {dayjs(detail.created_at).format("DD MMM YYYY HH:mm")}
							{detail.openedBy ? ` by ${detail.openedBy.name}` : null}
						</span>
					</p>
					<blockquote className="whitespace-pre-wrap text-pretty text-lg leading-snug">
						“{detail.reason}”
					</blockquote>
				</section>

				<dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-4 lg:grid-cols-4">
					<Fact label="Item">
						<span className="font-medium">
							{descriptors ?? subject.item.item_code}
						</span>
						{descriptors ? (
							<span className="break-all font-mono text-muted-foreground text-xs">
								{subject.item.item_code}
							</span>
						) : null}
					</Fact>
					<Fact label="Service">
						<span className="font-medium">{serviceName}</span>
						<span className="text-muted-foreground text-xs">
							{formatOrderServiceStatus(subject.status)}
						</span>
					</Fact>
					<Fact label="Order">
						<Link
							className="w-fit font-mono font-semibold underline-offset-2 hover:underline"
							params={{ orderId: String(order.id) }}
							to="/orders/$orderId"
						>
							{order.code}
						</Link>
						<span className="text-muted-foreground text-xs">
							{order.store?.name ?? "—"}
						</span>
					</Fact>
					<Fact label="Customer">
						<CustomerLink
							className="w-fit font-medium"
							customerId={order.customer.id}
							name={order.customer.name}
						/>
						<span className="text-muted-foreground text-xs tabular-nums">
							{order.customer.phone_number}
						</span>
					</Fact>
				</dl>

				<section className="grid gap-2">
					<h2 className="font-semibold text-sm">
						Rework rounds · {detail.reworkLines.length}
					</h2>
					{detail.reworkLines.length === 0 ? (
						<p className="text-muted-foreground text-sm">No rework started.</p>
					) : (
						// A round re-treats the complained Item, so its tag is the one
						// above (ADR-0017); rounds are told apart by number.
						<ul className="divide-y border-y">
							{detail.reworkLines.map((line, index) => {
								const changedAt = line.statusLogs[0]?.created_at;

								return (
									<li key={line.id}>
										<Link
											className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 py-3 pr-1 hover:bg-muted/40 sm:grid-cols-[6rem_9rem_1fr_auto]"
											params={{ orderId: order.id, serviceId: line.id }}
											to="/queue/$orderId/$serviceId"
										>
											<span className="font-medium text-sm">
												Round {index + 1}
											</span>
											<Badge
												className="justify-self-start"
												variant={getOrderServiceStatusBadgeVariant(line.status)}
											>
												{formatOrderServiceStatus(line.status)}
											</Badge>
											<CaretRightIcon
												aria-hidden="true"
												className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:order-last"
											/>
											<span className="col-span-3 text-muted-foreground text-xs tabular-nums sm:col-span-1 sm:text-sm">
												{[
													line.handler?.name ?? "Unassigned",
													changedAt
														? dayjs(changedAt).format("DD MMM HH:mm")
														: null,
												]
													.filter(Boolean)
													.join(" · ")}
											</span>
										</Link>
									</li>
								);
							})}
						</ul>
					)}
				</section>
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

		await context.queryClient.ensureQueryData(complaintsQueries.detail(id));
	},
	component: ComplaintDetailPage,
});
