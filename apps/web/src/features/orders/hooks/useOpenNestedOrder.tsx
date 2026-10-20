import type { MouseEvent } from "react";
import { OrderDetailView } from "@/features/orders/components/order-detail-view";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSheet } from "@/stores/sheet-store";

// A row in a sheet's list of Orders. A phone opens the Order's own page,
// whose back button returns to the list. A desktop opens it over the list,
// with a link back to that list.
export const useOpenNestedOrder = (orderId: number, code: string) => {
	const isMobile = useIsMobile();
	const openNestedSheet = useSheet((s) => s.openNestedSheet);
	const closeSheet = useSheet((s) => s.closeSheet);

	return (event: MouseEvent<HTMLAnchorElement>) => {
		if (isMobile) {
			closeSheet();
			return;
		}
		// A cmd- or middle-click still opens the Order in a new tab.
		if (
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.button !== 0
		) {
			return;
		}
		event.preventDefault();
		openNestedSheet({
			// The Order's own header already shows its code.
			title: <span className="sr-only">{code}</span>,
			backLabel: code,
			content: () => <OrderDetailView orderId={orderId} />,
		});
	};
};
