import type { Category } from "@/features/categories/api";
import type { Product } from "@/features/products/api";
import type { Service } from "@/features/services/api";
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
