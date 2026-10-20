import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ordersQueries } from "@/features/orders/api";
import { OrderDetailView } from "@/features/orders/components/order-detail-view";
import { OrderWalk } from "@/features/orders/components/order-walk";
import { useSheet } from "@/stores/sheet-store";

// A neighbour fetched this recently isn't fetched again on every list refresh.
const NEIGHBOUR_STALE_TIME = 30_000;

interface UseOrderSheetOptions {
	// The list has loaded, so the sheet can count the Order's place in it.
	isReady: boolean;
	onClose: () => void;
	onSelect: (orderId: number) => void;
	// The Order in the URL; undefined keeps the sheet shut.
	openId?: number;
	orders: { code?: string; id: number }[];
}

// The URL's ?open= drives the global sheet: a tablet or desktop opens the
// Order over the list, walks to the next one in place, and leaving the page
// closes it.
export const useOrderSheet = ({
	isReady,
	onClose,
	onSelect,
	openId,
	orders,
}: UseOrderSheetOptions) => {
	// Re-opening an open sheet only swaps what it shows, so walking doesn't
	// slide it out and in. A list refetch must not, or it would throw away a
	// payment form opened over the Order.
	// biome-ignore lint/correctness/useExhaustiveDependencies: only another Order or the list arriving re-points the sheet
	useEffect(() => {
		if (openId === undefined || !isReady) {
			return;
		}
		const code = orders.find((order) => order.id === openId)?.code ?? "Order";
		useSheet.getState().openSheet({
			// The Order's own header already shows its code.
			title: <span className="sr-only">{code}</span>,
			backLabel: code,
			actions: (
				<OrderWalk onSelect={onSelect} openId={openId} orders={orders} />
			),
			content: () => <OrderDetailView orderId={openId} />,
			onClose,
		});
	}, [openId, isReady]);

	// The Orders either side of the open one are fetched ahead, so a cashier
	// walking the list with J/K lands on a filled Order, not a skeleton.
	const queryClient = useQueryClient();
	useEffect(() => {
		if (openId === undefined) {
			return;
		}
		const index = orders.findIndex((order) => order.id === openId);
		for (const neighbour of [orders[index - 1], orders[index + 1]]) {
			if (index >= 0 && neighbour) {
				void queryClient.prefetchQuery({
					...ordersQueries.detail(neighbour.id),
					staleTime: NEIGHBOUR_STALE_TIME,
				});
			}
		}
	}, [openId, orders, queryClient]);

	const isOpen = openId !== undefined;
	useEffect(() => {
		if (!isOpen) {
			return;
		}
		return () => useSheet.getState().closeSheet();
	}, [isOpen]);
};
