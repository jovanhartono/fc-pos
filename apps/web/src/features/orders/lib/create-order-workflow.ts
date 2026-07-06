import type { QueryClient } from "@tanstack/react-query";

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
		queryClient.invalidateQueries({ queryKey: ["orders"] }),
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
