import { ArrowClockwiseIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import { cn } from "@/lib/utils";

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
	const firstDoneBy = [
		`First done by ${original.handler?.name ?? "unassigned"}`,
		firstPickupAt ? `picked up ${formatOrderDateTime(firstPickupAt)}` : null,
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
				className={cn(
					buttonVariants({ size: "sm", variant: "outline" }),
					"mt-1 w-fit",
				)}
				onClick={onNavigate}
				params={{ complaintId: String(reworkOf.id) }}
				to="/complaints/$complaintId"
			>
				See complaint
				<CaretRightIcon aria-hidden="true" />
			</Link>
		</section>
	);
};
