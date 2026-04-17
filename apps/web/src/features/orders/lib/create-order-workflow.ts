import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchOrderDetail, queryKeys } from "@/lib/api";

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
		toast.success("Order created");
		onFallbackNavigate();
		return;
	}

	const detail = await fetchOrderDetail(orderId);
	const itemCodes = detail.services
		.map((item) => item.item_code)
		.filter(Boolean) as string[];
	const preview = itemCodes.slice(0, 3).join(", ");
	const suffix = itemCodes.length > 3 ? ` +${itemCodes.length - 3} more` : "";

	toast.success("Order created", {
		description:
			itemCodes.length > 0 ? `Item tags: ${preview}${suffix}` : undefined,
	});
	onOrderDetailNavigate(orderId);
}
