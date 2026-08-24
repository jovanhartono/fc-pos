type ServiceItemDetails = {
	brand?: string | null;
	color?: string | null;
	model?: string | null;
	size?: string | null;
};

// One field order for every surface that names an Item — the cart line, the
// checkout row, the queue row. Two screens listing the same shoe as
// "Nike · Black · Yeezy" and "Nike · Yeezy · Black" read as two different items.
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

export function formatOrderServiceItemDetails(details: ServiceItemDetails) {
	return getOrderServiceItemDetails(details) ?? "No item details";
}
