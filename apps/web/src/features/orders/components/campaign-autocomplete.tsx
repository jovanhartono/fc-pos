import { CaretDownIcon, XIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { isCampaignAvailable } from "@/features/transactions/lib/transactions";
import { fetchCampaigns, queryKeys } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CampaignAutocompleteProps {
	id?: string;
	label?: string;
	storeId?: string;
	values: string[];
	onValuesChange: (values: string[]) => void;
	disabled?: boolean;
	error?: { message?: string };
}

export const CampaignAutocomplete = ({
	id = "order-campaign",
	label = "Campaigns (optional)",
	storeId,
	values,
	onValuesChange,
	disabled,
	error,
}: CampaignAutocompleteProps) => {
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

	const { selectableCampaigns, selectedCampaigns, valueSet } = useMemo(() => {
		const now = new Date();
		const selectable = campaigns.filter((campaign) =>
			isCampaignAvailable(campaign, now),
		);
		const selectedIds = new Set(values);
		const selected = selectable.filter((campaign) =>
			selectedIds.has(String(campaign.id)),
		);
		return {
			selectableCampaigns: selectable,
			selectedCampaigns: selected,
			valueSet: selectedIds,
		};
	}, [campaigns, values]);

	const hasSelection = selectedCampaigns.length > 0;

	useEffect(() => {
		if (
			!isCampaignQueryEnabled ||
			campaignQuery.isPending ||
			values.length === 0
		) {
			return;
		}
		const validIds = new Set(selectableCampaigns.map((c) => String(c.id)));
		const pruned = values.filter((id) => validIds.has(id));
		if (pruned.length !== values.length) {
			onValuesChange(pruned);
		}
	}, [
		isCampaignQueryEnabled,
		campaignQuery.isPending,
		selectableCampaigns,
		values,
		onValuesChange,
	]);

	const handleToggle = (campaignId: string) => {
		if (valueSet.has(campaignId)) {
			onValuesChange(values.filter((value) => value !== campaignId));
		} else {
			onValuesChange([...values, campaignId]);
		}
	};

	const handleRemove = (campaignId: string) => {
		onValuesChange(values.filter((value) => value !== campaignId));
	};

	const triggerDisabled = disabled || parsedStoreId === undefined;
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Popover open={isOpen} onOpenChange={setIsOpen}>
				<PopoverTrigger
					nativeButton={false}
					render={
						<div
							id={id}
							role="combobox"
							aria-haspopup="listbox"
							aria-expanded={isOpen}
							tabIndex={triggerDisabled ? -1 : 0}
							aria-disabled={triggerDisabled}
							className={cn(
								"flex h-auto min-h-10 w-full cursor-pointer items-center justify-between gap-2 border border-input bg-background px-3 py-2 text-left text-sm",
								"aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
							)}
						/>
					}
				>
					<div className="flex flex-1 flex-wrap items-center gap-1.5">
						{hasSelection ? (
							selectedCampaigns.map((campaign) => (
								<Badge
									key={campaign.id}
									variant="secondary"
									className="gap-1 pr-1"
								>
									{campaign.code}
									{!disabled ? (
										<button
											type="button"
											onClick={(event) => {
												event.stopPropagation();
												handleRemove(String(campaign.id));
											}}
											className="hover:text-destructive"
											aria-label={`Remove ${campaign.code}`}
										>
											<XIcon className="size-3" />
										</button>
									) : null}
								</Badge>
							))
						) : (
							<span className="text-muted-foreground">
								{parsedStoreId
									? "Select campaigns"
									: "Select store first to load campaigns"}
							</span>
						)}
					</div>
					<CaretDownIcon className="size-4 shrink-0 opacity-50" />
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-(--radix-popover-trigger-width) max-h-72 overflow-y-auto p-0"
				>
					{selectableCampaigns.length === 0 ? (
						<p className="p-3 text-muted-foreground text-sm">
							{parsedStoreId ? "No campaigns available" : "Select store first"}
						</p>
					) : (
						<ul className="divide-y">
							{selectableCampaigns.map((campaign) => {
								const campaignId = String(campaign.id);
								const isChecked = valueSet.has(campaignId);
								return (
									<li key={campaign.id}>
										<Button
											type="button"
											variant="ghost"
											className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2 text-left"
											onClick={() => handleToggle(campaignId)}
										>
											<Checkbox
												checked={isChecked}
												className="pointer-events-none"
												tabIndex={-1}
											/>
											<div className="flex flex-col">
												<span className="text-sm font-medium">
													{campaign.code}
												</span>
												<span className="text-muted-foreground text-xs">
													{campaign.name}
												</span>
											</div>
										</Button>
									</li>
								);
							})}
						</ul>
					)}
				</PopoverContent>
			</Popover>
			<FieldError errors={[error]} />
		</Field>
	);
};
