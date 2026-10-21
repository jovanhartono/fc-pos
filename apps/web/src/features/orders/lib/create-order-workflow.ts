import type { QueryClient } from "@tanstack/react-query";
import { onOrderMoved, onRedemptionSpent } from "@/lib/cache-events";

type HandleCreatedOrderSuccessOptions = {
	created: unknown;
	queryClient: QueryClient;
	onFallbackNavigate: () => void;
	onOrderDetailNavigate: (orderId: number) => void;
};

export function getCreatedOrderId(created: unknown): number | undefined {
	if (
		typeof created !== "object" ||
		created === null ||
		!("data" in created) ||
		typeof created.data !== "object" ||
		created.data === null ||
		!("id" in created.data)
	) {
		return undefined;
	}

	const { id } = created.data as { id?: unknown };
	return typeof id === "number" ? id : undefined;
}

export async function handleCreatedOrderSuccess({
	created,
	queryClient,
	onFallbackNavigate,
	onOrderDetailNavigate,
}: HandleCreatedOrderSuccessOptions) {
	const orderId = getCreatedOrderId(created);

	await Promise.all([
		// A new Order changes every count on /orders and the Queue.
		onOrderMoved(queryClient),
		// A spent Voucher code or Campaign changes what's Usable at the next
		// checkout, so one that just hit its Usage limit stops showing.
		onRedemptionSpent(queryClient),
	]);

	if (!orderId) {
		onFallbackNavigate();
		return;
	}

	onOrderDetailNavigate(orderId);
}
