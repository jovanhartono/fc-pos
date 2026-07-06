import { campaignIneligibilityReason } from "@fresclean/api/schema";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWatch } from "react-hook-form";
import {
	getCartPricing,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { campaignsQueryOptions } from "@/lib/query-options";
import { useTransactionsPageStore } from "@/stores/transactions-store";

// Shared checkout derivation — campaign eligibility + final pricing. Lives in a
// hook (not the component) because both the payment step's breakdown and the
// pinned footer's grand total need it; the campaigns query is request-deduped
// by TanStack Query, so calling this in two places costs only the cheap memos.
export function useCheckoutPricing() {
	const { subtotal, serviceRows } = useCart();
	const [selectedStoreId = "", selectedCampaignIds = [], manualDiscount = ""] =
		useWatch<
			TransactionDraftValues,
			["selectedStoreId", "selectedCampaignIds", "manualDiscount"]
		>({
			name: ["selectedStoreId", "selectedCampaignIds", "manualDiscount"],
		});

	const selectedStoreNumber =
		selectedStoreId && Number.isFinite(Number(selectedStoreId))
			? Number(selectedStoreId)
			: undefined;

	const campaignsQuery = useQuery({
		...campaignsQueryOptions({
			store_id: selectedStoreNumber,
			is_active: true,
		}),
		enabled: selectedStoreNumber !== undefined,
	});

	const availableCampaigns = useMemo(() => {
		if (selectedStoreNumber === undefined) {
			return [];
		}
		const now = new Date();
		return (campaignsQuery.data ?? []).filter(
			(campaign) =>
				campaignIneligibilityReason(campaign, {
					now,
					grossTotal: subtotal,
					storeId: selectedStoreNumber,
				}) === null,
		);
	}, [campaignsQuery.data, selectedStoreNumber, subtotal]);

	const selectedCampaigns = useMemo(() => {
		const selectedIdSet = new Set(selectedCampaignIds);
		return availableCampaigns.filter((campaign) =>
			selectedIdSet.has(String(campaign.id)),
		);
	}, [availableCampaigns, selectedCampaignIds]);

	const resolvedVoucherEntries = useTransactionsPageStore(
		(state) => state.resolvedVoucherEntries,
	);

	// Applied vouchers are code-mode campaigns resolved via /resolve-code; they
	// never appear in the tile list (selectedCampaigns), so merge them here so
	// the client discount preview reflects them alongside listed campaigns.
	const pricingCampaigns = useMemo(
		() => [
			...selectedCampaigns,
			...resolvedVoucherEntries.map((entry) => entry.campaign),
		],
		[selectedCampaigns, resolvedVoucherEntries],
	);

	const serviceLines = useMemo(
		() =>
			serviceRows.map((row) => ({
				price: Number(row.service.price),
				service_id: row.service.id,
			})),
		[serviceRows],
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

	return { subtotal, selectedCampaigns, pricing };
}
