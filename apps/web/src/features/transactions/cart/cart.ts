import {
	type CampaignContribution,
	type CampaignDiscountInput,
	type DiscountLine,
	fixedPriceSubtotal,
	stackCampaignDiscounts,
} from "@fresclean/api/schema";
import type { UseFormReturn } from "react-hook-form";
import type {
	CreateOrderPayload,
	Product,
	ResolvedVoucher,
	Service,
} from "@/lib/api";
import { isValidPhoneNumber, normalizePhoneNumber } from "@/lib/phone-number";
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
	brand: string;
	color: string;
	model: string;
	size: string;
	notes: string;
	// ADR-0018: only read for a no-list-price Service (Repair) — the cashier's
	// quote and whether it is firm ("" price until keyed). The server ignores
	// both on catalog-priced Services.
	price: string;
	is_estimate: boolean;
};

export type ProductCartDisplayLine = ProductCartLine & {
	product: Product;
};

export type ServiceCartDisplayLine = ServiceCartLine & {
	service: Service;
};

// A voucher the cashier has resolved (validated + previewed) but not yet
// committed. The code string rides in the checkout payload's voucher_codes;
// the campaign shape feeds the checkout pricing preview.
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
	serviceCart: ServiceCartLine[];
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

// The one price a service line has: the catalog snapshot, or — when the
// catalog carries none (Repair, ADR-0018) — whatever the cashier keyed.
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

// ADR-0019: the base Campaigns are judged and computed against. Must mirror
// the server exactly (both call fixedPriceSubtotal), or the POS previews a
// discount that checkout then rejects.
export const getCartCampaignBase = (
	productRows: { qty: number; product: { price: string | number } }[],
	serviceRows: SubtotalServiceRow[],
): number =>
	fixedPriceSubtotal([
		...productRows.map((line) => ({
			has_list_price: true,
			subtotal: parseMoney(line.product.price) * line.qty,
		})),
		...serviceRows.map((line) => ({
			has_list_price: line.service.price !== null,
			subtotal: getServiceLinePrice(line),
		})),
	]);

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
	campaignBase,
	campaigns,
	serviceLines,
	manualDiscount,
}: {
	subtotal: number;
	// Fixed-price subtotal (ADR-0019): what campaigns are stacked against and
	// what caps the whole discount — a Repair quote can move after checkout,
	// so no discount may lean on it.
	campaignBase: number;
	campaigns: C[];
	serviceLines: DiscountLine[];
	manualDiscount: string;
}): CartPricing<C> => {
	const stackInput = campaigns.map((campaign) => ({
		...campaign,
		eligible_service_ids:
			campaign.eligibleServices?.map((entry) => entry.service_id) ?? [],
	}));
	const stacked = stackCampaignDiscounts(
		campaignBase,
		stackInput,
		serviceLines,
	);
	const manualDiscountValue = Number(manualDiscount || 0);
	// Mirrors resolveDiscount: manual absorbs only what the fixed-price base
	// has left after campaigns.
	const appliedManual = Math.min(
		manualDiscountValue,
		Math.max(0, campaignBase - stacked.total),
	);
	const totalDiscount = stacked.total + appliedManual;

	return {
		campaignBreakdown: stacked.breakdown,
		campaignDiscount: stacked.total,
		manualDiscount: manualDiscountValue,
		totalDiscount,
		total: Math.max(0, subtotal - totalDiscount),
	};
};

// ADR-0018 POS gates. An Estimate is unconfirmed by definition at intake, so
// one in the cart means the Order cannot check out paid — the tender tiles
// lock instead of letting the server bounce the submit.
export const hasEstimateLine = (
	serviceRows: {
		is_estimate: boolean;
		service: { price: string | number | null };
	}[],
): boolean =>
	serviceRows.some((line) => line.service.price === null && line.is_estimate);

// No-list-price lines the cashier has not priced yet — each blocks leaving
// the Items step, mirroring the server's price-required rejection.
export const countUnpricedServiceLines = (
	serviceRows: SubtotalServiceRow[],
): number =>
	serviceRows.filter(
		(line) => line.service.price === null && getServiceLinePrice(line) <= 0,
	).length;

// The cart→payment gate: a customer is ready once they have a name and a phone
// that parses. Shared by the step tabs, the Continue button, and the Create
// Order button so all three progression controls enforce the identical rule.
export const isCustomerReady = (
	customerName: string,
	customerPhone: string,
): boolean =>
	customerName.trim().length > 0 && isValidPhoneNumber(customerPhone);

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
	serviceCart,
}: TransactionDraftValues): CreateOrderPayload => ({
	customer: {
		name: customerName.trim(),
		phone_number: normalizePhoneNumber(customerPhone),
	},
	store_id: Number(selectedStoreId),
	campaign_ids: selectedCampaignIds.map((id) => Number(id)),
	voucher_codes: appliedVouchers.map((entry) => entry.code.trim()),
	discount: manualDiscount || "0",
	payment_method_id: selectedPaymentMethodId
		? Number(selectedPaymentMethodId)
		: undefined,
	collected_by: selectedCourierId ? Number(selectedCourierId) : undefined,
	// A picked method means money arrived; no method means pay-later.
	payment_status: selectedPaymentMethodId ? "paid" : "unpaid",
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
		notes: line.notes.trim() || undefined,
		// Only meaningful on a no-list-price line; the server ignores both for
		// catalog-priced Services (ADR-0018).
		price: line.price.trim() || undefined,
		is_estimate: line.is_estimate || undefined,
	})),
});
