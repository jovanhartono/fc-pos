import type { OrderDetail } from "@/lib/api";

export type OrderItem = OrderDetail["items"][number];

export type OrderLine = OrderItem["services"][number] & { item: OrderItem };

// The order detail arrives grouped by object, because that is how the counter
// and the workshop both think (ADR-0017). Refunding, cancelling and
// complaining are still genuinely per-treatment though, so those surfaces
// flatten it here — each line keeping a handle on the object it belongs to,
// since the tag and the descriptors live there now.
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
