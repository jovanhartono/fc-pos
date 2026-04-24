import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api";

type HandleCreatedOrderSuccessOptions = {
	created: unknown;
	queryClient: QueryClient;
	onFallbackNavigate: () => void;
	onOrderDetailNavigate: (orderId: number) => void;
};

function getCreatedOrderId(created: unknown): number | undefined {
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

	await queryClient.invalidateQueries({ queryKey: ["orders"] });
	await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });

	if (!orderId) {
		onFallbackNavigate();
		return;
	}

	onOrderDetailNavigate(orderId);
}
