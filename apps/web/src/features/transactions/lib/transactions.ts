import type { Category, Product, Service } from "@/lib/api";

export type CatalogMode = "products" | "services";
export type CategoryFilter = "all" | number;

export type CategoryTab = {
	id: number;
	label: string;
	count: number;
};

export function getEntityCategoryName(
	entity: Product | Service,
	categoryMap: Map<number, Category>,
) {
	return (
		entity.category?.name ??
		categoryMap.get(entity.category_id)?.name ??
		"Other"
	);
}

export function buildCategoryTabs<T extends Product | Service>({
	items,
	categoryMap,
}: {
	items: T[];
	categoryMap: Map<number, Category>;
}) {
	const bucket = new Map<number, CategoryTab>();

	for (const item of items) {
		const existing = bucket.get(item.category_id);

		if (existing) {
			existing.count += 1;
			continue;
		}

		bucket.set(item.category_id, {
			id: item.category_id,
			label: getEntityCategoryName(item, categoryMap),
			count: 1,
		});
	}

	return [...bucket.values()].sort((left, right) =>
		left.label.localeCompare(right.label),
	);
}
