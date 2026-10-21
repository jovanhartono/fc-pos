import {
	applyManualDiscount,
	type CampaignContribution,
	type CampaignDiscountInput,
	type DiscountLine,
	normalizePhoneNumber,
	stackCampaignDiscounts,
} from "@fresclean/api/schema";
import type { UseFormReturn } from "react-hook-form";
import type { ResolvedVoucher } from "@/features/campaigns/api";
import type { CreateOrderPayload } from "@/features/orders/api";
import type { Product } from "@/features/products/api";
import type { Service } from "@/features/services/api";
import { parseMoney } from "@/shared/money";

export type ProductCartLine = {
	kind: "product";
	id: number;
	qty: number;
};

export type ServiceCartLine = {
	kind: "service";
	line_id: string;
	id: number;
	notes: string;
	// ADR-0018: only read for a Repair, the price agreed with the Customer or ""
	// while the workshop still has to inspect it.
	price: string;
};

// One Item and the Services sold for it (ADR-0017): a pair sold three Services
// is described once, not once per Service.
export type ItemCartLine = {
	line_id: string;
	brand: string;
	color: string;
	model: string;
	size: string;
	services: ServiceCartLine[];
};

export type ProductCartDisplayLine = ProductCartLine & {
	product: Product;
};

export type ServiceCartDisplayLine = ServiceCartLine & {
	service: Service;
};

export type ItemCartDisplayLine = Omit<ItemCartLine, "services"> & {
	services: ServiceCartDisplayLine[];
};

// A Voucher code the cashier has checked and previewed, not yet redeemed until
// the Order is placed.
export interface AppliedVoucher {
	code: string;
	campaign: ResolvedVoucher;
}

export type TransactionDraftValues = {
	selectedStoreId: string;
	customerName: string;
	customerPhone: string;
	selectedCampaignIds: string[];
	appliedVouchers: AppliedVoucher[];
	selectedPaymentMethodId: string;
	selectedCourierId: string;
	manualDiscount: string;
	notes: string;
	productCart: ProductCartLine[];
	itemCart: ItemCartLine[];
};

export const defaultDraftValues: TransactionDraftValues = {
	selectedStoreId: "",
	customerName: "",
	customerPhone: "",
	selectedCampaignIds: [],
	appliedVouchers: [],
	selectedPaymentMethodId: "",
	selectedCourierId: "",
	manualDiscount: "",
	notes: "",
	productCart: [],
	itemCart: [],
};

interface TransactionResetActions {
	setSubmitError: (message: string) => void;
	setDropoffPhoto: (file: File | null) => void;
}

export const createCartLineId = (prefix: string) =>
	globalThis.crypto?.randomUUID?.() ??
	`${prefix}-${Date.now()}-${Math.random()}`;

export const createEmptyItem = (): ItemCartLine => ({
	line_id: createCartLineId("item"),
	brand: "",
	color: "",
	model: "",
	size: "",
	services: [],
});

// Fixes a catalog tap that landed on the wrong Item (three shoes each needing a
// Deep Clean becoming one shoe with three) without retyping notes or price.
// `toItemId: null` splits it onto a new card; null back means nothing moved.
export const moveCartService = (
	cart: ItemCartLine[],
	fromItemId: string,
	lineId: string,
	toItemId: string | null,
): { cart: ItemCartLine[]; createdItemId: string | null } | null => {
	if (fromItemId === toItemId) {
		return null;
	}
	const source = cart.find((item) => item.line_id === fromItemId);
	const line = source?.services.find((service) => service.line_id === lineId);
	if (!line) {
		return null;
	}
	if (toItemId !== null && !cart.some((item) => item.line_id === toItemId)) {
		return null;
	}
	const stripped = cart.map((item) =>
		item.line_id === fromItemId
			? {
					...item,
					services: item.services.filter(
						(service) => service.line_id !== lineId,
					),
				}
			: item,
	);
	if (toItemId === null) {
		const created = { ...createEmptyItem(), services: [line] };
		return { cart: [...stripped, created], createdItemId: created.line_id };
	}
	return {
		cart: stripped.map((item) =>
			item.line_id === toItemId
				? { ...item, services: [...item.services, line] }
				: item,
		),
		createdItemId: null,
	};
};

// Which card a catalog tap lands on (ADR-0017). Worked out on every read, so a
// removed card falls back to the last one left and nothing has to re-point it.
export const resolveActiveItemId = (
	items: { line_id: string }[],
	pointer: string | null,
): string | null =>
	items.some((item) => item.line_id === pointer)
		? pointer
		: (items.at(-1)?.line_id ?? null);

// Both the Reset button and the reset after checkout clear through here: two
// copies once let the drop-off photo carry over to the next Customer's Order.
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

// A card with no Services stays: a new one has none yet, and taking the last
// Service off one is a correction, not a delete. toOrderPayload drops it.
export const enrichItemCart = <S extends { id: number }>(
	items: ItemCartLine[],
	serviceMap: Map<number, S>,
) =>
	items.map((item) => ({
		...item,
		services: enrichServiceCart(item.services, serviceMap),
	}));

// A Repair (ADR-0018) takes whatever the cashier typed; left blank it adds 0
// until priced, which is what the drop-off Receipt should show.
export const getServiceLinePrice = (line: {
	price: string;
	service: { price: string | number | null };
}): number =>
	line.service.price === null
		? parseMoney(line.price)
		: parseMoney(line.service.price);

type SubtotalServiceRow = {
	price: string;
	service: { price: string | number | null };
};

export const getCartSubtotal = (
	productRows: { qty: number; product: { price: string | number } }[],
	serviceRows: SubtotalServiceRow[],
): number =>
	productRows.reduce(
		(total, line) => total + parseMoney(line.product.price) * line.qty,
		0,
	) + serviceRows.reduce((total, line) => total + getServiceLinePrice(line), 0);

// An Item with no Service is a correction in progress, not a drop-off. Shared
// with the draft schema's "cart is empty" check so the two never disagree.
export const countCartTreatments = (itemCart: ItemCartLine[]): number =>
	itemCart.reduce((sum, item) => sum + item.services.length, 0);

// Counts Services, not Items: the badge answers "how many things are being
// sold", and an upsold pair is three of them.
export const getCartCount = (
	productCart: ProductCartLine[],
	itemCart: ItemCartLine[],
): number =>
	productCart.reduce((sum, item) => sum + item.qty, 0) +
	countCartTreatments(itemCart);

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
	// ADR-0018: a discount settles once every line price is final, so the
	// Campaign base is simply the Order total.
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
	const appliedManual = applyManualDiscount(
		subtotal,
		stacked.total,
		manualDiscountValue,
	);
	const totalDiscount = stacked.total + appliedManual;

	return {
		campaignBreakdown: stacked.breakdown,
		campaignDiscount: stacked.total,
		// What actually comes off, not what was typed — the summary column must
		// add up to the total beside it.
		manualDiscount: appliedManual,
		totalDiscount,
		total: Math.max(0, subtotal - totalDiscount),
	};
};

// A Repair left blank at drop-off is normal, so it never blocks checkout; it
// only blocks paying now, as the server does.
export const isUnpricedServiceLine = (line: SubtotalServiceRow): boolean =>
	line.service.price === null && getServiceLinePrice(line) <= 0;

export const countUnpricedServiceLines = (
	serviceRows: SubtotalServiceRow[],
): number => serviceRows.filter(isUnpricedServiceLine).length;

export const toOrderPayload = ({
	customerName,
	customerPhone,
	selectedStoreId,
	selectedCampaignIds,
	appliedVouchers,
	selectedPaymentMethodId,
	selectedCourierId,
	manualDiscount,
	notes,
	productCart,
	itemCart,
}: TransactionDraftValues): CreateOrderPayload => {
	const isPaidAtDropoff = selectedPaymentMethodId !== "";

	return {
		customer: {
			name: customerName.trim(),
			phone_number: normalizePhoneNumber(customerPhone),
		},
		store_id: Number(selectedStoreId),
		// Sent as drafted: a Campaign left on an unpaid Order (a stale tab) gets
		// the server's 400, not a silent strip the Customer finds at pickup (ADR-0018).
		campaign_ids: selectedCampaignIds.map((id) => Number(id)),
		voucher_codes: appliedVouchers.map((entry) => entry.code.trim()),
		discount: manualDiscount || "0",
		payment_method_id: isPaidAtDropoff
			? Number(selectedPaymentMethodId)
			: undefined,
		collected_by: selectedCourierId ? Number(selectedCourierId) : undefined,
		payment_status: isPaidAtDropoff ? "paid" : "unpaid",
		notes: notes.trim() || undefined,
		products: productCart.map((line) => ({
			id: line.id,
			qty: line.qty,
		})),
		// One entry per Item, its Services nested inside (ADR-0017). An Item with
		// no Service is not a drop-off, so it is left out.
		items: itemCart
			.filter((item) => item.services.length > 0)
			.map((item) => ({
				brand: item.brand.trim() || undefined,
				color: item.color.trim() || undefined,
				model: item.model.trim() || undefined,
				size: item.size.trim() || undefined,
				services: item.services.map((line) => ({
					id: line.id,
					notes: line.notes.trim() || undefined,
					price: line.price.trim() || undefined,
				})),
			})),
	};
};
