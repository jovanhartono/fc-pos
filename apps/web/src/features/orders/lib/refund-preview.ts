import { lineKey, orderLineRefundCaps } from "@fresclean/api/schema";
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
		total: detail.total,
	});
};
