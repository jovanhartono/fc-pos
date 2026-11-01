import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWatch } from "react-hook-form";
import { campaignsQueries } from "@/features/campaigns/api";
import {
	getCartPricing,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { filterEligibleCampaigns } from "@/features/transactions/lib/campaign-eligibility";
import { parseMoney } from "@/shared/money";

// Used by both the payment step and the footer's total; the Campaign fetch is
// shared, so two callers cost nothing extra.
export function useCheckoutPricing() {
	const { subtotal, serviceRows } = useCart();
	const [
		selectedStoreId = "",
		selectedCampaignIds = [],
		manualDiscount = "",
		appliedVouchers = [],
	] = useWatch<
		TransactionDraftValues,
		[
			"selectedStoreId",
			"selectedCampaignIds",
			"manualDiscount",
			"appliedVouchers",
		]
	>({
		name: [
			"selectedStoreId",
			"selectedCampaignIds",
			"manualDiscount",
			"appliedVouchers",
		],
	});

	const selectedStoreNumber =
		selectedStoreId && Number.isFinite(Number(selectedStoreId))
			? Number(selectedStoreId)
			: undefined;

	const campaignsQuery = useQuery({
		...campaignsQueries.list({
			store_id: selectedStoreNumber,
			is_active: true,
		}),
		enabled: selectedStoreNumber !== undefined,
	});

	// As on the server, a Repair can never be the free one in a BOGO (ADR-0018).
	const serviceLines = useMemo(
		() =>
			serviceRows.flatMap((row) =>
				row.service.price === null
					? []
					: [
							{
								price: parseMoney(row.service.price),
								service_id: row.service.id,
							},
						],
			),
		[serviceRows],
	);

	// Campaigns are judged against the Cart total (ADR-0018): a discount
	// settles only once every line is priced, so the total is the base.
	const availableCampaigns = useMemo(
		() =>
			filterEligibleCampaigns(campaignsQuery.data, {
				grossTotal: subtotal,
				lines: serviceLines,
				storeId: selectedStoreNumber,
			}),
		[campaignsQuery.data, selectedStoreNumber, subtotal, serviceLines],
	);

	const selectedCampaigns = useMemo(() => {
		const selectedIdSet = new Set(selectedCampaignIds);
		return availableCampaigns.filter((campaign) =>
			selectedIdSet.has(String(campaign.id)),
		);
	}, [availableCampaigns, selectedCampaignIds]);

	// Vouchers never appear in the Campaign tiles, so they join the price
	// preview here.
	const pricingCampaigns = useMemo(
		() => [
			...selectedCampaigns,
			...appliedVouchers.map((entry) => entry.campaign),
		],
		[selectedCampaigns, appliedVouchers],
	);

	const pricing = useMemo(
		() =>
			getCartPricing({
				subtotal,
				campaigns: pricingCampaigns,
				serviceLines,
				manualDiscount,
			}),
		[subtotal, pricingCampaigns, serviceLines, manualDiscount],
	);

	return {
		subtotal,
		availableCampaigns,
		campaignsQuery,
		selectedCampaigns,
		serviceLines,
		pricing,
	};
}
