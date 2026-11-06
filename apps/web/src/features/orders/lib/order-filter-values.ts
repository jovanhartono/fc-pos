// The Orders URL checks these on every app open, so they stay apart from the
// filter screens, which would bring the date picker along with them.
export const ORDER_STATUS_VALUES = [
	"created",
	"processing",
	"ready_for_pickup",
	"completed",
	"cancelled",
] as const;

export const PAYMENT_STATUS_VALUES = ["paid", "unpaid"] as const;

export const REFUND_STATUS_VALUES = ["any", "partial", "full"] as const;

export const NOTIFIED_VALUES = ["yes", "no"] as const;
