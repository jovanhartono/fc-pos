import { hasUnpricedLine } from "@fresclean/api/schema";
import {
	flattenOrderLines,
	type OrderItem,
	type OrderLine,
} from "@/features/orders/lib/order-lines";
import type { Me, OrderDetail } from "@/lib/api";

export interface OrderActionGates {
	isAdmin: boolean;
	isPaymentAllowed: boolean;
	isPickupAllowed: boolean;
	canManageDropoffPhoto: boolean;
	canManageCourier: boolean;
	canOpenPickup: boolean;
	pickupDisabledReason?: string;
	canCancelOrder: boolean;
	canRefundWholeOrder: boolean;
	canOpenComplaint: boolean;
	// ADR-0018: no price, no payment — any live unpriced line refuses the
	// Order's move to paid.
	hasUnpricedLine: boolean;
	complaintableServices: OrderLine[];
	// ADR-0017: what can actually leave the counter is an object, not a
	// treatment — you cannot hand back half a shoe.
	collectableItems: OrderItem[];
	refundableServices: OrderLine[];
	refundableProducts: OrderDetail["products"];
	cancellableServices: OrderLine[];
	cancellableProducts: OrderDetail["products"];
}

// ADR-0012 / ADR-0019: why a queued line cannot start yet, or undefined when
// it can. The verdict is the server's (`has_start_photo`); this only puts
// words to it before the button relays a 400. A Rework needs a photo taken
// after the customer brought the object back — its first-visit photos are
// there in the gallery but do not count.
export const startPhotoBlocker = (
	line: Pick<OrderLine, "status" | "has_start_photo" | "reworkOf">,
): string | undefined => {
	if (line.status !== "queued" || line.has_start_photo) {
		return undefined;
	}
	return line.reworkOf
		? "Photograph the returned item before starting the rework."
		: "Add an item photo before starting work.";
};

// Pure derivation of every role/state gate on the order detail page. `me`
// must come from /admin/users/me — JWT claims go stale when an admin changes
// roles mid-session.
export const getOrderActionGates = (
	me: Me | undefined,
	detail: OrderDetail,
): OrderActionGates => {
	const isAdmin = me?.role === "admin";
	const isCounterRole = isAdmin || me?.role === "cashier";
	// Every shop role takes payment at the POS since ADR-0004's 2026-09-05
	// amendment; a courier only clocks in, and a signed-out viewer gets nothing.
	const isPaymentAllowed = isCounterRole || me?.role === "worker";
	// Handing the Item back stays a separate gate: a worker still needs the
	// per-user flag, mirroring assertCanProcessPickup on the server.
	const isPickupAllowed = isCounterRole || me?.can_process_pickup === true;
	const canManageDropoffPhoto = isPaymentAllowed;
	// Courier attribution edit mirrors the create-order permission.
	const canManageCourier = isPaymentAllowed;

	const services = flattenOrderLines(detail);
	const collectableItems = (detail.items ?? []).filter(
		(item) => item.is_collectable,
	);
	const refundableServices = services.filter(
		// Rework lines are free (₀) — never refundable. Escalation refunds the
		// original complained line, not its rework (ADR-0013).
		(service) =>
			!service.reworkOf && !["refunded", "cancelled"].includes(service.status),
	);
	const products = Array.isArray(detail.products) ? detail.products : [];
	const refundableProducts = products.filter(
		(item) => !(item.refunded_at || item.cancelled_at),
	);
	const cancellableServices = services.filter(
		(service) =>
			!["picked_up", "refunded", "cancelled"].includes(service.status),
	);
	const cancellableProducts = products.filter(
		(item) => !item.refunded_at && !item.cancelled_at,
	);
	// ADR-0013: only picked_up lines with no complaint yet are complainable
	// (one complaint per line, lifetime); rework lines are never re-complained.
	const complaintableServices = services.filter(
		(service) =>
			!service.reworkOf &&
			service.status === "picked_up" &&
			(service.complaints ?? []).length === 0,
	);
	const isPaid = detail.payment_status === "paid";
	// ADR-0009: items are ready but the Order is unpaid — explain why pickup is
	// blocked, and to whom (a pickup-only worker must fetch a cashier to collect).
	const pickupDisabledReason =
		collectableItems.length > 0 && !isPaid
			? isPaymentAllowed
				? "Order must be paid before pickup."
				: "A cashier must collect payment before pickup."
			: undefined;

	return {
		isAdmin,
		isPaymentAllowed,
		isPickupAllowed,
		canManageDropoffPhoto,
		canManageCourier,
		// ADR-0009: payment precedes pickup — no collection on an unpaid Order.
		canOpenPickup: isPickupAllowed && collectableItems.length > 0 && isPaid,
		pickupDisabledReason,
		canCancelOrder:
			detail.status !== "cancelled" &&
			!isPaid &&
			(cancellableServices.length > 0 || cancellableProducts.length > 0),
		canRefundWholeOrder:
			isAdmin &&
			detail.status !== "cancelled" &&
			isPaid &&
			(refundableServices.length > 0 || refundableProducts.length > 0),
		// Opening a complaint is open to any staff (ADR-0013) — no role gate.
		canOpenComplaint: complaintableServices.length > 0,
		// ADR-0018: the same predicate the server's paid transition runs, so the
		// payment section can explain the block instead of relaying a 400.
		hasUnpricedLine: hasUnpricedLine(services),
		complaintableServices,
		collectableItems,
		refundableServices,
		refundableProducts,
		cancellableServices,
		cancellableProducts,
	};
};
