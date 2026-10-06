const HOUR_MS = 3_600_000;
const WARNING_WINDOW_MS = 24 * HOUR_MS;

export type QueueAgeTone = "muted" | "amber" | "red";

// Timed from drop-off, the workshop's clock — not PICKUP_OVERDUE_HOURS, which
// times the customer's collection from ready_at on a different screen.
export const getQueueAgeTone = (
	elapsedMs: number,
	promiseHours: number,
): QueueAgeTone => {
	const promiseMs = promiseHours * HOUR_MS;
	if (elapsedMs >= promiseMs) {
		return "red";
	}
	return elapsedMs >= promiseMs - WARNING_WINDOW_MS ? "amber" : "muted";
};
