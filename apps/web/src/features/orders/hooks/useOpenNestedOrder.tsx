import type { MouseEvent } from "react";
import { orderSheetPayload } from "@/features/orders/hooks/useOrderSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { isPlainLeftClick } from "@/lib/list-keys";
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
		if (!isPlainLeftClick(event)) {
			return;
		}
		event.preventDefault();
		openNestedSheet(orderSheetPayload(orderId, code));
	};
};
