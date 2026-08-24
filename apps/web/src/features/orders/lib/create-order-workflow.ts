import type { QueryClient } from "@tanstack/react-query";
import { invalidateOrderQueries } from "@/features/orders/lib/invalidate-order-queries";

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
		// A new order is an item on the workshop floor and a row in every count
		// the /orders pills show, so All and Today are wrong the moment this
		// returns unless the whole set is dropped.
		invalidateOrderQueries(queryClient),
		// A redeemed voucher / bumped listed-campaign redeemed_count changes what's
		// eligible at the next checkout — refresh campaigns so a capped promo that
		// just hit its limit stops showing as selectable and the voucher-codes
		// sheet reflects the new redemption.
		queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
	]);

	if (!orderId) {
		onFallbackNavigate();
		return;
	}

	onOrderDetailNavigate(orderId);
}
