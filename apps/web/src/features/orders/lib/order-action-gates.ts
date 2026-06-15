import type { Me, OrderDetail } from "@/lib/api";

export interface OrderActionGates {
	isAdmin: boolean;
	isPaymentAllowed: boolean;
	isPickupAllowed: boolean;
	canManageDropoffPhoto: boolean;
	canOpenPickup: boolean;
	canCancelOrder: boolean;
	canRefundWholeOrder: boolean;
	readyForPickupServices: OrderDetail["services"];
	refundableServices: OrderDetail["services"];
	refundableProducts: OrderDetail["products"];
	cancellableServices: OrderDetail["services"];
	cancellableProducts: OrderDetail["products"];
}

// Pure derivation of every role/state gate on the order detail page. `me`
// must come from /admin/users/me — JWT claims go stale when an admin changes
// roles mid-session.
export const getOrderActionGates = (
	me: Me | undefined,
	detail: OrderDetail,
): OrderActionGates => {
	const isAdmin = me?.role === "admin";
	const isPaymentAllowed = isAdmin || me?.role === "cashier";
	const isPickupAllowed = isPaymentAllowed || me?.can_process_pickup === true;
	const canManageDropoffPhoto = isPaymentAllowed || me?.role === "worker";

	const services = Array.isArray(detail.services) ? detail.services : [];
	const readyForPickupServices = services.filter(
		(service) => service.status === "ready_for_pickup",
	);
	const refundableServices = services.filter(
		(service) => !["refunded", "cancelled"].includes(service.status),
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
	const isPaid = detail.payment_status === "paid";

	return {
		isAdmin,
		isPaymentAllowed,
		isPickupAllowed,
		canManageDropoffPhoto,
		canOpenPickup: isPickupAllowed && readyForPickupServices.length > 0,
		canCancelOrder:
			detail.status !== "cancelled" &&
			!isPaid &&
			(cancellableServices.length > 0 || cancellableProducts.length > 0),
		canRefundWholeOrder:
			isAdmin &&
			detail.status !== "cancelled" &&
			isPaid &&
			(refundableServices.length > 0 || refundableProducts.length > 0),
		readyForPickupServices,
		refundableServices,
		refundableProducts,
		cancellableServices,
		cancellableProducts,
	};
};
