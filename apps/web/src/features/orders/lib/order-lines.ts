import type { OrderDetail } from "@/features/orders/api";
export type OrderItem = OrderDetail["items"][number];

export type OrderLine = OrderItem["services"][number] & { item: OrderItem };

// The Order detail arrives grouped by Item (ADR-0017), but Refunds,
// Cancellations and Complaints are per OrderService, so those screens flatten it.
export const flattenOrderLines = (detail: OrderDetail): OrderLine[] =>
	(detail.items ?? []).flatMap((item) =>
		item.services.map((service) => ({ ...service, item })),
	);

// Both detail sheets read their line live out of the cached order, so a status
// change made in the sheet shows immediately instead of pinning a stale prop.
export const findOrderLine = (
	detail: OrderDetail | undefined,
	serviceId: number,
): OrderLine | undefined =>
	detail
		? flattenOrderLines(detail).find((line) => line.id === serviceId)
		: undefined;
