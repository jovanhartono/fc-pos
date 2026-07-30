import { lineKey, lineRefundCap } from "@fresclean/api/schema";
import type { OrderDetail } from "@/lib/api";

// Client-side mirror of the server's per-line refund caps, built from the same
// pure math (lineRefundCap) over the same inputs the server reads from the DB
// (line gross, order gross, order discount, already-refunded sums) — so the
// dialog preview always matches what the server books.
export const buildRefundCaps = (detail: OrderDetail): Map<string, number> => {
	const grossTotal = Number(detail.total ?? 0);
	const orderDiscount = Number(detail.discount ?? 0);

	const refundedByLineKey = new Map<string, number>();
	for (const refund of detail.refunds ?? []) {
		for (const item of refund.items ?? []) {
			const key =
				item.order_service_id == null
					? lineKey("product", item.order_product_id ?? 0)
					: lineKey("service", item.order_service_id);
			refundedByLineKey.set(
				key,
				(refundedByLineKey.get(key) ?? 0) + Number(item.amount),
			);
		}
	}

	const capFor = (key: string, subtotal: string | null) =>
		lineRefundCap({
			alreadyRefunded: refundedByLineKey.get(key) ?? 0,
			grossLine: Number(subtotal ?? 0),
			grossTotal,
			orderDiscount,
		});

	const caps = new Map<string, number>();
	for (const service of detail.services ?? []) {
		const key = lineKey("service", service.id);
		caps.set(key, capFor(key, service.subtotal));
	}
	for (const product of detail.products ?? []) {
		const key = lineKey("product", product.id);
		caps.set(
			key,
			product.refunded_at || product.cancelled_at
				? 0
				: capFor(key, product.subtotal),
		);
	}
	return caps;
};
