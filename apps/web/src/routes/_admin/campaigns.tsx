import {
	ArchiveIcon,
	ArrowCounterClockwiseIcon,
	PencilSimpleLineIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	CampaignForm,
	type CampaignFormState,
} from "@/features/campaigns/components/campaign-form";
import {
	type Campaign,
	type CampaignPayload,
	createCampaign,
	queryKeys,
	updateCampaign,
} from "@/lib/api";
import { campaignsQueryOptions, storesQueryOptions } from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";
import { getCurrentUser } from "@/stores/auth-store";
import { useDialog } from "@/stores/dialog-store";
import { useSheet } from "@/stores/sheet-store";

const CAMPAIGN_STATUS_OPTIONS = [
	"all",
	"active",
	"expired",
	"archived",
] as const;

const campaignsSearchSchema = z.object({
	status: z.enum(CAMPAIGN_STATUS_OPTIONS).catch("all"),
});

type CampaignStatus = (typeof CAMPAIGN_STATUS_OPTIONS)[number];

function deriveCampaignState(
	campaign: Campaign,
): Exclude<CampaignStatus, "all"> {
	if (!campaign.is_active) {
		return "archived";
	}
	if (campaign.is_expired) {
		return "expired";
	}
	return "active";
}

export const Route = createFileRoute("/_admin/campaigns")({
	validateSearch: (search) => campaignsSearchSchema.parse(search),
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(campaignsQueryOptions()),
			context.queryClient.ensureQueryData(storesQueryOptions()),
		]),
	component: CampaignsPage,
});

const defaultCampaignForm: CampaignFormState = {
	code: "",
	name: "",
	discount_type: "fixed",
	discount_value: "0",
	min_order_total: "0",
	max_discount: "",
	starts_at: "",
	ends_at: "",
	is_active: true,
	store_ids: [],
};

function toDateTimeLocal(value: Date | string | null | undefined) {
	if (!value) {
		return "";
	}

	const date = new Date(value);
	const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return adjusted.toISOString().slice(0, 16);
}

function formatCampaignDiscount(campaign: Campaign) {
	if (campaign.discount_type === "percentage") {
		return `${campaign.discount_value}%`;
	}

	return formatIDRCurrency(String(campaign.discount_value));
}

function ArchiveCampaignButton({
	campaign,
	disabled,
	isPending,
	onConfirm,
}: {
	campaign: Campaign;
	disabled: boolean;
	isPending: boolean;
	onConfirm: (options: {
		campaignId: number;
		nextIsActive: boolean;
	}) => Promise<void>;
}) {
	const { openDialog, closeDialog } = useDialog();
	const isArchived = !campaign.is_active;
	const label = isArchived ? "Unarchive" : "Archive";
	const Icon = isArchived ? ArrowCounterClockwiseIcon : ArchiveIcon;

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={disabled || isPending}
			icon={<Icon className="size-4" />}
			className={
				isArchived ? undefined : "text-destructive hover:text-destructive"
			}
			onClick={() => {
				openDialog({
					title: `${label} campaign?`,
					description: isArchived
						? `Make ${campaign.code} (${campaign.name}) active again?`
						: `Archive ${campaign.code} (${campaign.name})? It will stop appearing in the active list but history stays.`,
					footer: () => (
						<>
							<Button variant="outline" onClick={closeDialog}>
								Cancel
							</Button>
							<Button
								variant={isArchived ? "default" : "destructive"}
								disabled={isPending}
								onClick={async () => {
									await onConfirm({
										campaignId: campaign.id,
										nextIsActive: isArchived,
									});
									closeDialog();
								}}
							>
								{label} campaign
							</Button>
						</>
					),
				});
			}}
		>
			{label}
		</Button>
	);
}

function CampaignsPage() {
	const user = getCurrentUser();
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const isAdmin = user?.role === "admin";
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();

	const campaignsQuery = useQuery(campaignsQueryOptions());
	const storesQuery = useQuery(storesQueryOptions());

	const stores = storesQuery.data ?? [];
	const allCampaigns = campaignsQuery.data ?? [];
	const campaigns = useMemo(() => {
		if (search.status === "all") {
			return allCampaigns;
		}
		return allCampaigns.filter(
			(campaign) => deriveCampaignState(campaign) === search.status,
		);
	}, [allCampaigns, search.status]);

	const createMutation = useMutation({
		mutationKey: ["create-campaign"],
		mutationFn: createCampaign,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
			await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
			closeSheet();
		},
	});

	const updateMutation = useMutation({
		mutationKey: ["update-campaign"],
		mutationFn: ({
			id,
			payload,
		}: {
			id: number;
			payload: Partial<CampaignPayload>;
		}) => updateCampaign(id, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
			closeSheet();
		},
	});

	const archiveMutation = useMutation({
		mutationKey: ["archive-campaign"],
		mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
			updateCampaign(id, { is_active }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
			await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
		},
	});

	const handleOpenCreateSheet = () => {
		openSheet({
			title: "Add Campaign",
			content: () => (
				<CampaignForm
					defaultValues={defaultCampaignForm}
					isEditing={false}
					onReset={closeSheet}
					stores={stores}
					handleOnSubmit={async (payload) => {
						await createMutation.mutateAsync(payload);
					}}
				/>
			),
		});
	};

	const handleOpenEditSheet = useCallback(
		(campaign: Campaign) => {
			openSheet({
				title: "Edit Campaign",
				content: () => (
					<CampaignForm
						defaultValues={{
							code: campaign.code,
							name: campaign.name,
							discount_type: campaign.discount_type,
							discount_value: String(campaign.discount_value),
							min_order_total: String(campaign.min_order_total),
							max_discount: campaign.max_discount
								? String(campaign.max_discount)
								: "",
							starts_at: toDateTimeLocal(campaign.starts_at),
							ends_at: toDateTimeLocal(campaign.ends_at),
							is_active: campaign.is_active,
							store_ids: campaign.stores.map((item) => item.store_id),
						}}
						isEditing
						onReset={closeSheet}
						stores={stores}
						handleOnSubmit={async (payload) => {
							await updateMutation.mutateAsync({
								id: campaign.id,
								payload,
							});
						}}
					/>
				),
			});
		},
		[closeSheet, openSheet, stores, updateMutation],
	);

	const columns = useMemo<ColumnDef<Campaign>[]>(
		() => [
			{ accessorKey: "code", header: "Code" },
			{ accessorKey: "name", header: "Name" },
			{
				id: "discount",
				header: "Discount",
				cell: ({ row }) => formatCampaignDiscount(row.original),
			},
			{
				accessorKey: "min_order_total",
				header: "Min Order",
				cell: ({ row }) =>
					formatIDRCurrency(String(row.original.min_order_total)),
			},
			{
				accessorKey: "max_discount",
				header: "Max Discount",
				cell: ({ row }) =>
					row.original.max_discount
						? formatIDRCurrency(String(row.original.max_discount))
						: "—",
			},
			{
				id: "stores",
				header: "Stores",
				cell: ({ row }) => {
					if (row.original.stores.length === 0) {
						return "All Stores";
					}

					return row.original.stores
						.map((item) => item.store?.code ?? String(item.store_id))
						.join(", ");
				},
			},
			{
				id: "status",
				header: "Status",
				cell: ({ row }) => {
					const state = deriveCampaignState(row.original);
					if (state === "expired") {
						return <Badge variant="warning">Expired</Badge>;
					}
					if (state === "archived") {
						return <Badge variant="secondary">Archived</Badge>;
					}
					return <Badge variant="success">Active</Badge>;
				},
			},
			{
				id: "actions",
				header: "Actions",
				cell: ({ row }) => (
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={!isAdmin}
							onClick={() => handleOpenEditSheet(row.original)}
							icon={<PencilSimpleLineIcon className="size-4" />}
						>
							Edit
						</Button>
						<ArchiveCampaignButton
							campaign={row.original}
							disabled={!isAdmin}
							isPending={archiveMutation.isPending}
							onConfirm={async ({ campaignId, nextIsActive }) => {
								await archiveMutation.mutateAsync({
									id: campaignId,
									is_active: nextIsActive,
								});
							}}
						/>
					</div>
				),
			},
		],
		[archiveMutation, handleOpenEditSheet, isAdmin],
	);

	return (
		<>
			<PageHeader
				title="Campaigns"
				actions={
					<>
						<Badge variant={campaignsQuery.isPending ? "secondary" : "outline"}>
							{`${campaigns.length} items`}
						</Badge>
						<Button
							onClick={handleOpenCreateSheet}
							disabled={!isAdmin}
							icon={<PlusIcon className="size-4" />}
						>
							Add Campaign
						</Button>
					</>
				}
			/>
			<div className="grid gap-4">
				<Card>
					<CardContent className="pt-6">
						<div className="mb-4 flex items-center gap-2">
							<Select
								value={search.status}
								onValueChange={(value) => {
									void navigate({
										search: () => ({
											status: (value as CampaignStatus) ?? "all",
										}),
									});
								}}
							>
								<SelectTrigger size="md" className="min-w-40 w-max">
									<SelectValue placeholder="Filter status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All status</SelectItem>
									<SelectItem value="active">Active only</SelectItem>
									<SelectItem value="expired">Expired only</SelectItem>
									<SelectItem value="archived">Archived only</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<DataTable
							columns={columns}
							data={campaigns}
							isLoading={campaignsQuery.isPending || storesQuery.isPending}
							sortable
							cardPrimaryColumnId="name"
						/>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
