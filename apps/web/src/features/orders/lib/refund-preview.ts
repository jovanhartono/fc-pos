import {
	allocateRefund,
	lineKey,
	orderLineRefundCaps,
	type RefundLineRef,
} from "@fresclean/api/rules";
import type { OrderDetail } from "@/features/orders/api";
import { flattenOrderLines } from "@/features/orders/lib/order-lines";
import { parseMoney } from "@/shared/money";

export const buildRefundCaps = (detail: OrderDetail): Map<string, number> => {
	const refundedByLineKey = new Map<string, number>();
	for (const refund of detail.refunds ?? []) {
		for (const item of refund.items ?? []) {
			const key =
				item.order_service_id == null
					? lineKey("product", item.order_product_id ?? 0)
					: lineKey("service", item.order_service_id);
			refundedByLineKey.set(
				key,
				(refundedByLineKey.get(key) ?? 0) + parseMoney(item.amount),
			);
		}
	}

	return orderLineRefundCaps({
		campaigns: detail.campaigns ?? [],
		discount: detail.discount,
		products: detail.products ?? [],
		refundedByLineKey,
		services: flattenOrderLines(detail),
	});
};

// Amounts come from the same allocateRefund the server runs at submit.
// Picked lines are allocated together (leftover rupiah shift with the set);
// the rest preview what they'd refund alone.
export const previewRefund = (
	caps: Map<string, number>,
	lines: RefundLineRef[],
	picked: RefundLineRef[],
): { byLine: Map<string, number>; total: number } => {
	const capOf = (line: RefundLineRef) =>
		caps.get(lineKey(line.kind, line.id)) ?? 0;
	const byLine = new Map<string, number>();
	const refundable = picked.filter((line) => capOf(line) > 0);
	if (refundable.length > 0) {
		for (const line of allocateRefund({
			capsByLineKey: caps,
			lines: refundable,
		})) {
			byLine.set(lineKey(line.kind, line.id), line.amount);
		}
	}
	for (const line of lines) {
		const key = lineKey(line.kind, line.id);
		if (!byLine.has(key)) {
			byLine.set(
				key,
				capOf(line) > 0
					? allocateRefund({
							capsByLineKey: caps,
							lines: [{ id: line.id, kind: line.kind }],
						})[0].amount
					: 0,
			);
		}
	}
	const total = picked.reduce(
		(sum, line) => sum + (byLine.get(lineKey(line.kind, line.id)) ?? 0),
		0,
	);
	return { byLine, total };
};
