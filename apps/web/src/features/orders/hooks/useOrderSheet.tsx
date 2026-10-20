import { useEffect } from "react";
import { OrderDetailView } from "@/features/orders/components/order-detail-view";
import { OrderWalk } from "@/features/orders/components/order-walk";
import { useSheet } from "@/stores/sheet-store";

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

	const isOpen = openId !== undefined;
	useEffect(() => {
		if (!isOpen) {
			return;
		}
		return () => useSheet.getState().closeSheet();
	}, [isOpen]);
};
