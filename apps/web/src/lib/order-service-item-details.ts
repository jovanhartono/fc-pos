type ServiceItemDetails = {
	brand?: string | null;
	color?: string | null;
	model?: string | null;
	size?: string | null;
};

// One field order for every surface that names an Item — the cart line, the
// checkout row, the queue row. Two screens listing the same Item as
// "Nike · Black · Yeezy" and "Nike · Yeezy · Black" read as two different Items.
export function getOrderServiceItemDescriptors({
	brand,
	model,
	color,
	size,
}: ServiceItemDetails): string[] {
	return [brand, model, color, size].flatMap((value) => {
		const trimmed = value?.trim();
		return trimmed ? [trimmed] : [];
	});
}

export function getOrderServiceItemDetails(
	details: ServiceItemDetails,
): string | null {
	return getOrderServiceItemDescriptors(details).join(" · ") || null;
}

interface ItemNameRow {
	item_code: string;
	item_brand: string | null;
	item_model: string | null;
	item_color: string | null;
	item_size: string | null;
}

// Report and Counter rows name the shoe, not its tag; a shoe taken in with no
// details has only the tag to go by.
export const getItemName = (row: ItemNameRow) =>
	getOrderServiceItemDetails({
		brand: row.item_brand,
		model: row.item_model,
		color: row.item_color,
		size: row.item_size,
	}) ?? row.item_code;

export function formatOrderServiceItemDetails(details: ServiceItemDetails) {
	return getOrderServiceItemDetails(details) ?? "No item details";
}
