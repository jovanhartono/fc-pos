import type { DiscountLine } from "@fresclean/api/rules";
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { campaignsQueries } from "@/features/campaigns/api";
import {
	getCartPricing,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { filterEligibleCampaigns } from "@/features/transactions/lib/campaign-eligibility";
import { parseMoney } from "@/shared/money";

export const useAvailableCampaigns = (
	selectedStoreNumber: number | undefined,
	subtotal: number,
	serviceLines: DiscountLine[],
) => {
	const campaignsQuery = useQuery({
		...campaignsQueries.list({
			store_id: selectedStoreNumber,
			is_active: true,
		}),
		enabled: selectedStoreNumber !== undefined,
	});

	// Campaigns are judged against the Cart total (ADR-0018): a discount
	// settles only once every line is priced, so the total is the base.
	const availableCampaigns = filterEligibleCampaigns(campaignsQuery.data, {
		grossTotal: subtotal,
		lines: serviceLines,
		storeId: selectedStoreNumber,
	});

	return { campaignsQuery, availableCampaigns };
};

// Used by both the payment step and the footer's total; the Campaign fetch is
// shared, so two callers cost nothing extra.
export function useCheckoutPricing() {
	const { subtotal, serviceRows } = useCart();
	const selectedStoreId = useWatch<TransactionDraftValues, "selectedStoreId">({
		name: "selectedStoreId",
	});
	const selectedCampaignIds = useWatch<
		TransactionDraftValues,
		"selectedCampaignIds"
	>({
		name: "selectedCampaignIds",
	});
	const manualDiscount = useWatch<TransactionDraftValues, "manualDiscount">({
		name: "manualDiscount",
	});
	const appliedVouchers = useWatch<TransactionDraftValues, "appliedVouchers">({
		name: "appliedVouchers",
	});
	const deliveryFeeInput = useWatch<TransactionDraftValues, "deliveryFee">({
		name: "deliveryFee",
	});

	const selectedStoreNumber =
		selectedStoreId && Number.isFinite(Number(selectedStoreId))
			? Number(selectedStoreId)
			: undefined;

	// As on the server, a Repair can never be the free one in a BOGO (ADR-0018).
	const serviceLines = serviceRows.flatMap((row) =>
		row.service.price === null
			? []
			: [
					{
						price: parseMoney(row.service.price),
						service_id: row.service.id,
					},
				],
	);

	const { campaignsQuery, availableCampaigns } = useAvailableCampaigns(
		selectedStoreNumber,
		subtotal,
		serviceLines,
	);

	const selectedIdSet = new Set(selectedCampaignIds);
	const selectedCampaigns = availableCampaigns.filter((campaign) =>
		selectedIdSet.has(String(campaign.id)),
	);

	// Vouchers never appear in the Campaign tiles, so they join the price
	// preview here.
	const pricingCampaigns = [
		...selectedCampaigns,
		...appliedVouchers.map((entry) => entry.campaign),
	];

	const pricing = getCartPricing({
		subtotal,
		campaigns: pricingCampaigns,
		serviceLines,
		manualDiscount,
	});
	const discountedTotal = Math.round(pricing.total);

	// Added after the discounts, which never reach it (ADR-0029).
	const deliveryFee = Number(deliveryFeeInput || 0);

	return {
		subtotal,
		availableCampaigns,
		campaignsQuery,
		selectedCampaigns,
		serviceLines,
		pricing,
		deliveryFee,
		amountDue: discountedTotal + deliveryFee,
	};
}
