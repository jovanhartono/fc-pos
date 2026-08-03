import type { Category, Product, Service } from "@/lib/api";

export type CatalogMode = "products" | "services";
export type CategoryFilter = "all" | number;

// The store picker lives in the catalog, which the checkout sheet covers and
// which scrolls off the top on a phone. A cashier told "select a store first"
// has to be taken there, so the field is addressed by id rather than by a ref
// threaded across the workspace.
export const STORE_FIELD_ID = "transaction-store";

export function focusStoreField() {
	const field = document.getElementById(STORE_FIELD_ID);
	field?.scrollIntoView({ block: "center", behavior: "smooth" });
	// preventScroll or focus jumps the page and cancels the smooth scroll above.
	field?.focus({ preventScroll: true });
}

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
