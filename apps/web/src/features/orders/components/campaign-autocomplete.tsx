import { useQuery } from "@tanstack/react-query";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { fetchCampaigns, queryKeys } from "@/lib/api";

type CampaignAutocompleteProps = {
	id?: string;
	label?: string;
	storeId?: string;
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	error?: { message?: string };
};

export function CampaignAutocomplete({
	id = "order-campaign",
	label = "Campaign (optional)",
	storeId,
	value,
	onValueChange,
	disabled,
	error,
}: CampaignAutocompleteProps) {
	const numericStoreId = storeId ? Number(storeId) : undefined;
	const parsedStoreId =
		numericStoreId !== undefined && Number.isFinite(numericStoreId)
			? numericStoreId
			: undefined;
	const isCampaignQueryEnabled = parsedStoreId !== undefined;
	const campaignQuery = useQuery({
		queryKey: queryKeys.campaigns({
			store_id: parsedStoreId,
			is_active: true,
		}),
		queryFn: () =>
			fetchCampaigns({
				store_id: parsedStoreId,
				is_active: true,
			}),
		enabled: isCampaignQueryEnabled,
	});

	const campaigns = campaignQuery.data ?? [];
	const now = new Date();
	const selectableCampaigns = campaigns.filter((campaign) => {
		if (campaign.starts_at && new Date(campaign.starts_at) > now) {
			return false;
		}

		if (campaign.ends_at && new Date(campaign.ends_at) < now) {
			return false;
		}

		return true;
	});
	const isLoadingCampaigns = isCampaignQueryEnabled && campaignQuery.isFetching;

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Combobox
				id={id}
				triggerClassName="h-10 w-full text-sm"
				options={[
					{ value: "none", label: "No campaign" },
					...selectableCampaigns.map((campaign) => ({
						value: String(campaign.id),
						label: `${campaign.code} - ${campaign.name}`,
					})),
				]}
				value={value || "none"}
				onValueChange={(nextValue) =>
					onValueChange(!nextValue || nextValue === "none" ? "" : nextValue)
				}
				loading={isLoadingCampaigns}
				placeholder={
					parsedStoreId ? "No campaign" : "Select store first to load campaigns"
				}
				searchPlaceholder="Search campaign..."
				emptyText={
					parsedStoreId ? "No campaign found" : "Please choose store first"
				}
				disabled={disabled || parsedStoreId === undefined}
			/>
			<FieldError errors={[error]} />
		</Field>
	);
}
