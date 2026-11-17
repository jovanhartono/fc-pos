import {
	ORDER_SERVICE_TRANSITIONS,
	ORDER_TERMINAL_SERVICE_STATUSES,
} from "@fresclean/api/rules";
import type { UpdateOrderServiceStatusPayload } from "@/features/orders/api";
import { startPhotoBlocker } from "@/features/orders/lib/order-action-gates";

// Terminal statuses (cancelled/refunded/picked_up) go through dedicated
// endpoints — the status endpoint rejects them, so they are never rendered.
export type NonTerminalServiceStatus = Exclude<
	UpdateOrderServiceStatusPayload["status"],
	(typeof ORDER_TERMINAL_SERVICE_STATUSES)[number]
>;

type ActionLine = Parameters<typeof startPhotoBlocker>[0] & {
	handler_id?: number | null;
	handler?: { name: string } | null;
};

export interface OrderServiceActions {
	// Queued lines only; the blocker says why work can't start yet.
	start: { blocker: string | undefined } | null;
	moves: NonTerminalServiceStatus[];
	photoBlocker: string | undefined;
	// Always false without a Queue worker.
	isHeldByMe: boolean;
	isHeldByOther: boolean;
}

const TERMINAL_SERVICE_STATUSES = new Set<string>(
	ORDER_TERMINAL_SERVICE_STATUSES,
);

// The Queue passes the worker's id and stops them starting an Item another
// worker holds; the Order sheet passes nothing, so the counter can start it.
export const orderServiceActions = (
	line: ActionLine,
	queueWorkerId?: number,
): OrderServiceActions => {
	const isHeldByMe =
		queueWorkerId !== undefined && line.handler_id === queueWorkerId;
	const isHeldByOther =
		queueWorkerId !== undefined &&
		line.handler_id !== null &&
		line.handler_id !== undefined &&
		!isHeldByMe;
	const isQueued = line.status === "queued";
	const photoBlocker = startPhotoBlocker(line);
	const moves = (ORDER_SERVICE_TRANSITIONS[line.status] ?? []).filter(
		(status): status is NonTerminalServiceStatus =>
			!(
				TERMINAL_SERVICE_STATUSES.has(status) ||
				(isQueued && status === "processing")
			),
	);
	const lockMessage = isHeldByOther
		? `${line.handler?.name ?? "Another worker"} is handling this item — actions are locked for you.`
		: undefined;

	return {
		start: isQueued ? { blocker: lockMessage ?? photoBlocker } : null,
		moves,
		photoBlocker,
		isHeldByMe,
		isHeldByOther,
	};
};
