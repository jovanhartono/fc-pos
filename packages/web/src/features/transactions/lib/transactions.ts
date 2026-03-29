import type {
	Campaign,
	Category,
	CreateOrderPayload,
	Product,
	Service,
} from "@/lib/api";

export type CatalogMode = "products" | "services";
export type CategoryFilter = "all" | number;

export type ProductCartLine = {
	kind: "product";
	id: number;
	qty: number;
};

export type ServiceCartLine = {
	kind: "service";
	line_id: string;
	id: number;
	brand: string;
	color: string;
	model: string;
	size: string;
};

export type ProductCartDisplayLine = ProductCartLine & {
	product: Product;
};

export type ServiceCartDisplayLine = ServiceCartLine & {
	service: Service;
};

export type TransactionDraftValues = {
	selectedStoreId: string;
	selectedCustomerId: string;
	selectedCampaignId: string;
	selectedPaymentMethodId: string;
	paymentStatus: CreateOrderPayload["payment_status"];
	manualDiscount: string;
	notes: string;
	productCart: ProductCartLine[];
	serviceCart: ServiceCartLine[];
};

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

export function isCampaignAvailable(campaign: Campaign, now: Date) {
	if (!campaign.is_active) {
		return false;
	}

	if (campaign.starts_at && new Date(campaign.starts_at) > now) {
		return false;
	}

	if (campaign.ends_at && new Date(campaign.ends_at) < now) {
		return false;
	}

	return true;
}

export function getCampaignDiscount(subtotal: number, campaign?: Campaign) {
	if (!campaign) {
		return 0;
	}

	const minimumOrderTotal = Number(campaign.min_order_total ?? 0);

	if (subtotal < minimumOrderTotal) {
		return 0;
	}

	if (campaign.discount_type === "percentage") {
		const rawDiscount = (subtotal * Number(campaign.discount_value ?? 0)) / 100;
		const maxDiscount = Number(campaign.max_discount ?? 0);

		if (maxDiscount > 0) {
			return Math.min(rawDiscount, maxDiscount);
		}

		return rawDiscount;
	}

	return Number(campaign.discount_value ?? 0);
}

export function toTransactionPayload({
	selectedCustomerId,
	selectedStoreId,
	selectedCampaignId,
	selectedPaymentMethodId,
	paymentStatus,
	manualDiscount,
	notes,
	productCart,
	serviceCart,
}: TransactionDraftValues): CreateOrderPayload {
	return {
		customer_id: Number(selectedCustomerId),
		store_id: Number(selectedStoreId),
		campaign_id: selectedCampaignId ? Number(selectedCampaignId) : undefined,
		discount: manualDiscount || "0",
		payment_method_id: selectedPaymentMethodId
			? Number(selectedPaymentMethodId)
			: undefined,
		payment_status: paymentStatus,
		notes: notes.trim() || undefined,
		products: productCart.map((line) => ({
			id: line.id,
			qty: line.qty,
			notes: undefined,
		})),
		services: serviceCart.map((line) => ({
			id: line.id,
			brand: line.brand.trim() || undefined,
			color: line.color.trim() || undefined,
			model: line.model.trim() || undefined,
			size: line.size.trim() || undefined,
			notes: undefined,
		})),
	};
}
