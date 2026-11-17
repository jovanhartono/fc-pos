import {
	type DerivedItemStatus,
	isCollectableItemStatus,
	isWaitingQcOnly,
} from "@fresclean/api/rules";
import type { PublicTrackedOrder, TrackCharge } from "@/features/track/api";
import { hasQris } from "@/lib/qris";

interface TrackItem {
	status: DerivedItemStatus;
	services: { status: string }[];
}

export const STAGES = ["Received", "Cleaning", "QC", "Ready"] as const;

// The rail follows the Items, not the money. The Order says "completed" for a
// refunded Item still on our rack (ADR-0008), which showed all four stages done
// for a shoe the customer still has to come and get.
const getItemStageIndex = (item: TrackItem): number => {
	if (isCollectableItemStatus(item.status)) {
		return 3;
	}
	if (item.status === "processing") {
		return isWaitingQcOnly(item.services) ? 2 : 1;
	}
	return 0;
};

// Still in the shop and still owed to the customer.
const isPendingItem = (item: TrackItem) =>
	item.status !== "picked_up" && item.status !== "cancelled";

export const trackProgress = (items: TrackItem[]) => {
	const pending = items.filter(isPendingItem);
	return {
		// Customers come once for everything, so the rail sits where the slowest
		// Item sits. Nothing pending — a products-only Order, or every Item already
		// collected — reads as done rather than sitting on "Received".
		stageIndex:
			pending.length === 0
				? STAGES.length
				: Math.min(...pending.map(getItemStageIndex)),
		// Same predicate the server gates pickup_code on, so the code never shows
		// without a collectable Item behind it.
		readyCount: pending.filter((item) => isCollectableItemStatus(item.status))
			.length,
		pendingCount: pending.length,
	};
};

type TrackPaymentOrder = Pick<
	PublicTrackedOrder,
	"payment_status" | "net_due" | "open_charge"
>;

// A paid Order owes nothing and can't be paid online, so Paid and Expired never
// need to show together.
export const trackPayment = (
	order: TrackPaymentOrder,
	shownCharge: TrackCharge | null,
): "paid-here" | "expired" | "none" => {
	if (shownCharge === null) {
		return "none";
	}
	if (order.payment_status === "paid") {
		return "paid-here";
	}
	// The gateway's clock, not the phone's, says when a QR ends: gone while the
	// amount stayed the same means it ran out.
	return !hasQris(order.open_charge) && shownCharge.amount === order.net_due
		? "expired"
		: "none";
};
