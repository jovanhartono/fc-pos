type ServiceItemDetails = {
	brand?: string | null;
	color?: string | null;
	model?: string | null;
	size?: string | null;
};

export function formatOrderServiceItemDetails({
	brand,
	model,
	color,
	size,
}: ServiceItemDetails) {
	const parts = [brand, model, color, size].flatMap((value) => {
		const trimmed = value?.trim();
		return trimmed ? [trimmed] : [];
	});

	return parts.join(" · ") || "No item details";
}
