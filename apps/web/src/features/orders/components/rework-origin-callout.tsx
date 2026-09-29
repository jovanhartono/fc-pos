import { ArrowClockwiseIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { formatOrderDateTime } from "@/features/orders/lib/format";

interface ReworkOriginCalloutProps {
	reworkOf: {
		id: number;
		reason: string;
		orderService: {
			service: { name: string } | null;
			handler: { name: string } | null;
		};
	};
	firstPickupAt: string | null;
	// The order sheet closes itself so the Complaint page is not hidden under it.
	onNavigate?: () => void;
}

// The worker needs whose treatment the customer turned down, and why, before
// redoing it.
export const ReworkOriginCallout = ({
	reworkOf,
	firstPickupAt,
	onNavigate,
}: ReworkOriginCalloutProps) => {
	const original = reworkOf.orderService;
	const serviceName = original.service?.name ?? "Service";
	const firstDoneBy = [
		`First done by ${original.handler?.name ?? "unassigned"}`,
		firstPickupAt ? `picked up ${formatOrderDateTime(firstPickupAt)}` : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<Link
			aria-label={`See complaint: rework of ${serviceName}`}
			className="group grid gap-1.5 border border-info/40 bg-info/5 p-3 text-sm outline-none transition-colors hover:bg-info/10 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
			onClick={onNavigate}
			params={{ complaintId: String(reworkOf.id) }}
			// A worker scrolling past the box has not asked for the Complaint.
			preload={false}
			to="/complaints/$complaintId"
		>
			<span className="flex items-start gap-1.5 font-medium">
				<ArrowClockwiseIcon
					aria-hidden="true"
					className="mt-0.5 size-4 shrink-0 text-info"
					weight="bold"
				/>
				<span className="min-w-0 flex-1">Rework of {serviceName}</span>
				<CaretRightIcon
					aria-hidden="true"
					className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
					weight="bold"
				/>
			</span>
			<span className="text-muted-foreground text-xs">{firstDoneBy}</span>
			<blockquote className="whitespace-pre-wrap">
				“{reworkOf.reason}”
			</blockquote>
		</Link>
	);
};
