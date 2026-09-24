import { ArrowClockwiseIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { formatOrderDateTime } from "@/features/orders/lib/format";

interface ReworkOriginCalloutProps {
	reworkOf: {
		id: number;
		created_at: string;
		reason: string;
		orderService: {
			service: { name: string } | null;
			handler: { name: string } | null;
			pickupEvent: { picked_up_at: string } | null;
		};
	};
	onNavigate?: () => void;
}

// A rework is the same pair back on the rack. The worker needs to know whose
// treatment the customer turned down and why, before redoing it.
export const ReworkOriginCallout = ({
	reworkOf,
	onNavigate,
}: ReworkOriginCalloutProps) => {
	const original = reworkOf.orderService;
	// Turned down at the counter, the pair leaves with its rework in one pickup;
	// that date is the rework's handover, not a first trip home.
	const firstPickup =
		original.pickupEvent &&
		dayjs(original.pickupEvent.picked_up_at).isBefore(reworkOf.created_at)
			? original.pickupEvent.picked_up_at
			: null;
	const firstDoneBy = [
		`First done by ${original.handler?.name ?? "unassigned"}`,
		firstPickup ? `picked up ${formatOrderDateTime(firstPickup)}` : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<section className="grid gap-1.5 border border-info/40 bg-info/5 p-3 text-sm">
			<p className="flex items-center gap-1.5 font-medium">
				<ArrowClockwiseIcon
					aria-hidden="true"
					className="size-4 shrink-0 text-info"
					weight="bold"
				/>
				Rework of {original.service?.name ?? "Service"}
			</p>
			<p className="text-muted-foreground text-xs">{firstDoneBy}</p>
			<blockquote className="whitespace-pre-wrap">
				“{reworkOf.reason}”
			</blockquote>
			<Link
				className="flex w-fit items-center gap-0.5 font-medium text-xs underline underline-offset-2 hover:text-muted-foreground"
				onClick={onNavigate}
				params={{ complaintId: String(reworkOf.id) }}
				to="/complaints/$complaintId"
			>
				Complaint #{reworkOf.id}
				<CaretRightIcon aria-hidden="true" className="size-3" />
			</Link>
		</section>
	);
};
