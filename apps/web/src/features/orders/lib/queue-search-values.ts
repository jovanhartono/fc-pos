import type {
	QUEUE_CATEGORY_MODES as SERVER_QUEUE_CATEGORY_MODES,
	WORKSHOP_SERVICE_STATUSES as SERVER_WORKSHOP_SERVICE_STATUSES,
} from "@fresclean/api/rules";

// Checked on every app open, where the server's copies would pull all of `rules`
// into the first download. Typed against them, so type-check catches drift.
export const WORKSHOP_SERVICE_STATUSES: typeof SERVER_WORKSHOP_SERVICE_STATUSES =
	["queued", "processing", "waiting_qc", "qc_reject"];

export const QUEUE_CATEGORY_MODES: typeof SERVER_QUEUE_CATEGORY_MODES = [
	"only",
	"except",
];
