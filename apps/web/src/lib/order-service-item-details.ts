type ServiceItemDetails = {
	brand?: string | null;
	color?: string | null;
	model?: string | null;
	size?: string | null;
};

export function getOrderServiceItemDetails({
	brand,
	model,
	color,
	size,
}: ServiceItemDetails): string | null {
	const parts = [brand, model, color, size].flatMap((value) => {
		const trimmed = value?.trim();
		return trimmed ? [trimmed] : [];
	});

	return parts.join(" · ") || null;
}

export function formatOrderServiceItemDetails(details: ServiceItemDetails) {
	return getOrderServiceItemDetails(details) ?? "No item details";
}
