import {
	type CampaignContribution,
	type CampaignDiscountInput,
	type DiscountLine,
	stackCampaignDiscounts,
} from "@fresclean/api/schema";
import type { UseFormReturn } from "react-hook-form";
import type { CreateOrderPayload, Product, Service } from "@/lib/api";

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
	selectedCampaignIds: string[];
	selectedPaymentMethodId: string;
	paymentStatus: CreateOrderPayload["payment_status"];
	manualDiscount: string;
	notes: string;
	productCart: ProductCartLine[];
	serviceCart: ServiceCartLine[];
};

export const defaultDraftValues: TransactionDraftValues = {
	selectedStoreId: "",
	selectedCustomerId: "",
	selectedCampaignIds: [],
	selectedPaymentMethodId: "",
	paymentStatus: "unpaid",
	manualDiscount: "",
	notes: "",
	productCart: [],
	serviceCart: [],
};

type TransactionResetActions = {
	setSubmitError: (message: string) => void;
	setDropoffPhoto: (file: File | null) => void;
};

// Single source of truth for clearing the POS draft — used by both the Reset
// button (useCartOps) and the post-checkout reset (page bootstrap). Keeps cart,
// submit error, and the held drop-off photo from drifting; they previously
// lived in two near-duplicate resets and the photo was missed on one path.
export const resetTransactionDraft = (
	form: UseFormReturn<TransactionDraftValues>,
	{ setSubmitError, setDropoffPhoto }: TransactionResetActions,
) => {
	const selectedStoreId = form.getValues("selectedStoreId");
	setSubmitError("");
	setDropoffPhoto(null);
	form.reset({ ...defaultDraftValues, selectedStoreId });
};

export const buildActiveItemMap = <
	T extends { id: number; is_active: boolean },
>(
	items: T[],
): Map<number, T> =>
	new Map(
		items.filter((item) => item.is_active).map((item) => [item.id, item]),
	);

export const enrichProductCart = <P extends { id: number }>(
	lines: ProductCartLine[],
	productMap: Map<number, P>,
): (ProductCartLine & { product: P })[] =>
	lines.flatMap((line) => {
		const product = productMap.get(line.id);
		return product ? [{ ...line, product }] : [];
	});

export const enrichServiceCart = <S extends { id: number }>(
	lines: ServiceCartLine[],
	serviceMap: Map<number, S>,
): (ServiceCartLine & { service: S })[] =>
	lines.flatMap((line) => {
		const service = serviceMap.get(line.id);
		return service ? [{ ...line, service }] : [];
	});

export const getCartSubtotal = (
	productRows: { qty: number; product: { price: string | number } }[],
	serviceRows: { service: { price: string | number } }[],
): number =>
	productRows.reduce(
		(total, line) => total + Number(line.product.price) * line.qty,
		0,
	) +
	serviceRows.reduce((total, line) => total + Number(line.service.price), 0);

export const getCartCount = (
	productCart: ProductCartLine[],
	serviceCart: ServiceCartLine[],
): number =>
	productCart.reduce((sum, item) => sum + item.qty, 0) + serviceCart.length;

export type CartCampaign = CampaignDiscountInput & {
	eligibleServices?: { service_id: number }[] | null;
};

export interface CartPricing<C extends CartCampaign> {
	campaignBreakdown: CampaignContribution<C>[];
	campaignDiscount: number;
	manualDiscount: number;
	totalDiscount: number;
	total: number;
}

export const getCartPricing = <C extends CartCampaign>({
	subtotal,
	campaigns,
	serviceLines,
	manualDiscount,
}: {
	subtotal: number;
	campaigns: C[];
	serviceLines: DiscountLine[];
	manualDiscount: string;
}): CartPricing<C> => {
	const stackInput = campaigns.map((campaign) => ({
		...campaign,
		eligible_service_ids:
			campaign.eligibleServices?.map((entry) => entry.service_id) ?? [],
	}));
	const stacked = stackCampaignDiscounts(subtotal, stackInput, serviceLines);
	const manualDiscountValue = Number(manualDiscount || 0);
	const totalDiscount = Math.min(subtotal, manualDiscountValue + stacked.total);

	return {
		campaignBreakdown: stacked.breakdown,
		campaignDiscount: stacked.total,
		manualDiscount: manualDiscountValue,
		totalDiscount,
		total: Math.max(0, subtotal - totalDiscount),
	};
};

export const toOrderPayload = ({
	selectedCustomerId,
	selectedStoreId,
	selectedCampaignIds,
	selectedPaymentMethodId,
	paymentStatus,
	manualDiscount,
	notes,
	productCart,
	serviceCart,
}: TransactionDraftValues): CreateOrderPayload => ({
	customer_id: Number(selectedCustomerId),
	store_id: Number(selectedStoreId),
	campaign_ids: selectedCampaignIds.map((id) => Number(id)),
	discount: manualDiscount || "0",
	payment_method_id: selectedPaymentMethodId
		? Number(selectedPaymentMethodId)
		: undefined,
	payment_status: paymentStatus,
	notes: notes.trim() || undefined,
	products: productCart.map((line) => ({
		id: line.id,
		qty: line.qty,
	})),
	services: serviceCart.map((line) => ({
		id: line.id,
		brand: line.brand.trim() || undefined,
		color: line.color.trim() || undefined,
		model: line.model.trim() || undefined,
		size: line.size.trim() || undefined,
		notes: undefined,
	})),
});
