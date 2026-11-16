import { TURNAROUND_PROMISE_HOURS } from "@fresclean/api/rules";
import { RowChevron } from "@/components/message-row";
import { Badge } from "@/components/ui/badge";
import type { QueueItem, QueueItemService } from "@/features/orders/api";
import { ReworkRoundLabel } from "@/features/orders/components/rework-round-label";
import { getQueueAgeTone } from "@/features/orders/lib/queue-age-tone";
import { groupReworksUnderOriginals } from "@/features/orders/lib/rework-nesting";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { cn } from "@/lib/utils";

function formatElapsedDuration(ms: number): string {
	const totalMinutes = Math.floor(ms / 60_000);
	if (totalMinutes < 60) {
		return `${Math.max(totalMinutes, 0)}m`;
	}
	const totalHours = Math.floor(totalMinutes / 60);
	if (totalHours < 48) {
		return `${totalHours}h`;
	}
	return `${Math.floor(totalHours / 24)}d`;
}

interface QueueJobButtonProps {
	service: QueueItemService;
	currentUserId?: number;
	onOpen: () => void;
}

const QueueJobButton = ({
	service,
	currentUserId,
	onOpen,
}: QueueJobButtonProps) => {
	const reworkRound = service.rework_round;
	const handler =
		service.handler_id === currentUserId
			? "Me"
			: (service.handler_name ??
				(service.handler_id === null ? null : "Worker"));

	return (
		<button
			className={cn(
				"grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-ring-inset",
				// Steps in under the line it redoes, as on the Order sheet.
				reworkRound !== null && "pt-1 pl-8",
			)}
			onClick={onOpen}
			type="button"
		>
			<span className="min-w-0 break-words text-body">
				{reworkRound === null ? (
					service.service_name
				) : (
					<ReworkRoundLabel
						round={reworkRound}
						serviceName={service.service_name}
					/>
				)}
			</span>
			<span className="row-span-2">
				<RowChevron />
			</span>
			<span className="flex min-w-0 flex-wrap items-center gap-1.5 text-subhead">
				<Badge variant={getOrderServiceStatusBadgeVariant(service.status)}>
					{formatOrderServiceStatus(service.status)}
				</Badge>
				{service.is_priority && reworkRound === null ? (
					<Badge variant="priority">Priority</Badge>
				) : null}
				{handler ? <span>{handler}</span> : null}
			</span>
		</button>
	);
};

interface QueueRowProps {
	item: QueueItem;
	currentUserId?: number;
	now: number;
	onOpen: (item: QueueItem, serviceId: number) => void;
}

// One card per Item, with every Service still open on it listed inside
// (ADR-0017). A shoe in for a deep clean, a repaint and leather care used to be
// three rows on the rack with nothing saying they were the same shoe. No lock
// needed: two workers can't hold one shoe at once.
export const QueueRow = ({
	item,
	currentUserId,
	now,
	onOpen,
}: QueueRowProps) => {
	const elapsedMs = Math.max(
		0,
		now - new Date(item.order_created_at).getTime(),
	);
	const ageTone = getQueueAgeTone(elapsedMs, TURNAROUND_PROMISE_HOURS);

	// Descriptors are optional at intake, so falling back to the tag keeps the
	// heading from reading "No item details" at full weight.
	const descriptors = getOrderServiceItemDetails(item);

	return (
		// min-w-0 at every level down to the truncating text: without it the card's
		// min-content sizes the auto grid column, and the search field and status
		// chips above — siblings in that same column — get pushed off screen.
		<article className="min-w-0 overflow-hidden rounded-lg border bg-card">
			<header className="grid min-w-0 gap-0.5 px-3 pt-2.5 pb-2">
				<h3 className="flex min-w-0 items-baseline gap-2 font-medium text-headline leading-snug">
					{descriptors ? (
						<span className="min-w-0 flex-1 wrap-break-word">
							{descriptors}
						</span>
					) : (
						<span className="min-w-0 flex-1 break-all tabular-nums">
							{item.item_code}
						</span>
					)}
				</h3>
				<p className="flex min-w-0 items-baseline gap-2 text-subhead">
					<span className="min-w-0 flex-1 truncate">
						{item.order_code} · {item.customer_name}
					</span>
					<span
						className={cn(
							"shrink-0 font-semibold tabular-nums",
							ageTone === "amber" && "text-tone-warn-foreground",
							ageTone === "red" && "text-destructive",
						)}
					>
						{formatElapsedDuration(elapsedMs)}
					</span>
				</p>
			</header>

			{/* Each Service is its own target: the worker taps the one they are
			    about to do, not the Item. */}
			<ul className="grid">
				{groupReworksUnderOriginals(
					item.services,
					(service) => service.rework_of_line_id,
				).map(({ original, originalId, reworks }) => (
					<li className="min-w-0 border-border/70 border-t" key={originalId}>
						{original ? (
							<QueueJobButton
								currentUserId={currentUserId}
								onOpen={() => onOpen(item, original.id)}
								service={original}
							/>
						) : (
							// Picked up and brought back: the original is off the rack,
							// but the worker still needs to know what is being redone.
							<p className="min-w-0 wrap-break-word px-3 pt-2.5 text-body">
								{reworks[0]?.rework_of_service_name ?? "Service"}
							</p>
						)}
						{reworks.map((rework) => (
							<QueueJobButton
								currentUserId={currentUserId}
								key={rework.id}
								onOpen={() => onOpen(item, rework.id)}
								service={rework}
							/>
						))}
					</li>
				))}
			</ul>
		</article>
	);
};
