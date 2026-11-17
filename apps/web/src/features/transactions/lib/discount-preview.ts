import {
	type DiscountLine,
	isBogoSlot,
	orderNetDue,
} from "@fresclean/api/rules";
import {
	type CartCampaign,
	getCartPricing,
} from "@/features/transactions/cart/cart";
import { parseMoney } from "@/shared/money";

export interface PreviewCampaign extends CartCampaign {
	id: number;
	code: string;
	name: string;
}

export interface DiscountPreviewRow {
	key: string;
	label: string;
	amount: number;
	isDiscount: boolean;
}

interface PreviewDiscountsInput {
	grossTotal: number;
	lines: DiscountLine[];
	eligible: PreviewCampaign[];
	pickedCampaignIds: string[];
	vouchers: { campaign: PreviewCampaign }[];
	manualDiscount: string;
	deliveryFee: number;
	refunded?: number;
}

interface PricedLine {
	price: string | null;
	service: { id: number; price: string | null } | null;
	status: string;
	complaint_id: number | null;
}

// The server's own Buy N slot rule (ADR-0018), so the preview matches what
// payment settles: a Repair with no list price is never the free one.
export const toDiscountLines = (lines: PricedLine[]): DiscountLine[] =>
	lines.flatMap((line) =>
		line.service !== null && isBogoSlot(line)
			? [{ price: parseMoney(line.price), service_id: line.service.id }]
			: [],
	);

// What the cashier sees at payment, POS checkout and Collect Payment alike.
export const previewDiscounts = ({
	grossTotal,
	lines,
	eligible,
	pickedCampaignIds,
	vouchers,
	manualDiscount,
	deliveryFee,
	refunded = 0,
}: PreviewDiscountsInput) => {
	const pricing = getCartPricing({
		subtotal: grossTotal,
		// Vouchers never appear in the Campaign tiles, so they join the price
		// preview here.
		campaigns: [
			...eligible.filter((campaign) =>
				pickedCampaignIds.includes(String(campaign.id)),
			),
			...vouchers.map((entry) => entry.campaign),
		],
		serviceLines: lines,
		manualDiscount,
	});

	const rows: DiscountPreviewRow[] = pricing.campaignBreakdown.map(
		({ campaign, amount }) => ({
			key: `campaign-${campaign.id}`,
			label: `${campaign.code} (${campaign.name})`,
			amount,
			isDiscount: true,
		}),
	);
	if (pricing.manualDiscount > 0) {
		rows.push({
			key: "manual-discount",
			label: "Manual discount",
			amount: pricing.manualDiscount,
			isDiscount: true,
		});
	}
	// Added after the discounts, which never reach it (ADR-0029).
	if (deliveryFee > 0) {
		rows.push({
			key: "delivery-fee",
			label: "Delivery fee",
			amount: deliveryFee,
			isDiscount: false,
		});
	}

	return {
		rows,
		totalDiscount: pricing.totalDiscount,
		amountDue: orderNetDue({
			grossTotal,
			discount: pricing.totalDiscount,
			refunded,
			deliveryFee,
		}),
	};
};
