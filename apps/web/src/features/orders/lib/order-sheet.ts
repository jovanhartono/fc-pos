import { hasUnpricedLine } from "@fresclean/api/schema";
import { parseMoney } from "@/shared/money";

interface PickupProgressItem {
	is_collectable: boolean;
	status: string;
}

// A new or unpaid Order has nothing on the shelf yet, and "0 of 2 picked up"
// there reads as if the Customer was due back already.
export const showsPickupProgress = (items: PickupProgressItem[]): boolean =>
	items.some((item) => item.is_collectable || item.status === "picked_up");

interface ItemTotalLine {
	complaint_id: number | null;
	price: string | null;
	status: string;
	subtotal: string | null;
}

// One paid Service plus its free Rework is still one price, already on its
// Line; a total row only adds up two or more sold Services.
export const getItemTotalRow = (
	services: ItemTotalLine[],
): { amount: number | null } | null => {
	const sold = services.filter(
		(service) =>
			service.status !== "cancelled" && service.complaint_id === null,
	);
	if (sold.length < 2) {
		return null;
	}
	if (hasUnpricedLine(sold)) {
		return { amount: null };
	}
	return {
		amount: sold.reduce(
			(sum, service) => sum + parseMoney(service.subtotal),
			0,
		),
	};
};
