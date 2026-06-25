import type { Category, Product, Service } from "@/lib/api";

export type CatalogMode = "products" | "services";
export type CategoryFilter = "all" | number;

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
