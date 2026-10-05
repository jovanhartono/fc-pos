const HOUR_MS = 3_600_000;
const WARNING_WINDOW_MS = 24 * HOUR_MS;

export type QueueAgeTone = "muted" | "amber" | "red";

// Both thresholds hang off the one turnaround promise: amber from 24h before
// it, red once the promise is reached. Change the promise and both move.
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
