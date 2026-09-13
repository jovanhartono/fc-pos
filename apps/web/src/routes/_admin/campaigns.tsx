import {
	ArchiveIcon,
	ArrowCounterClockwiseIcon,
	PencilSimpleLineIcon,
	PlusIcon,
	TicketIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { SelectField } from "@/components/form/select-field";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	type Campaign,
	campaignsKeys,
	campaignsQueries,
	createCampaign,
	type UpdateCampaignPayload,
	updateCampaign,
} from "@/features/campaigns/api";
import {
	CampaignForm,
	type CampaignFormInput,
} from "@/features/campaigns/components/campaign-form";
import { VoucherCodesSheet } from "@/features/campaigns/components/voucher-codes-sheet";
import { storesQueries } from "@/features/stores/api";
import { usersQueries } from "@/features/users/api";
import { formatMoney } from "@/shared/money";
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
			context.queryClient.ensureQueryData(campaignsQueries.list()),
			context.queryClient.ensureQueryData(storesQueries.list()),
			context.queryClient.ensureQueryData(usersQueries.me()),
		]),
	component: CampaignsPage,
});

const defaultCampaignForm: CampaignFormInput = {
	code: "",
	name: "",
	redemption_mode: "listed",
	discount_type: "fixed",
	discount_value: "0",
	min_order_total: "0",
	max_discount: null,
	usage_limit: null,
	code_count: null,
	buy_quantity: null,
	free_quantity: null,
	starts_at: null,
	ends_at: null,
	is_active: true,
	store_ids: [],
	eligible_service_ids: [],
};

function toDateTimeLocal(value: Date | string | null | undefined) {
	if (!value) {
		return null;
	}

	const date = new Date(value);
	const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return adjusted.toISOString().slice(0, 16);
}

function toCampaignFormInput(campaign: Campaign): CampaignFormInput {
	return {
		code: campaign.code,
		name: campaign.name,
		redemption_mode: campaign.redemption_mode,
		discount_type: campaign.discount_type,
		discount_value: String(campaign.discount_value),
		min_order_total: String(campaign.min_order_total),
		max_discount: campaign.max_discount ? String(campaign.max_discount) : null,
		usage_limit: campaign.usage_limit,
		code_count: null,
		buy_quantity: campaign.buy_quantity,
		free_quantity: campaign.free_quantity,
		starts_at: toDateTimeLocal(campaign.starts_at),
		ends_at: toDateTimeLocal(campaign.ends_at),
		is_active: campaign.is_active,
		store_ids: campaign.stores.map((item) => item.store_id),
		eligible_service_ids:
			campaign.eligibleServices?.map((item) => item.service_id) ?? [],
	};
}

function formatCampaignDiscount(campaign: Campaign) {
	if (campaign.discount_type === "percentage") {
		return `${campaign.discount_value}%`;
	}

	if (campaign.discount_type === "buy_n_get_m_free") {
		return `Buy ${campaign.buy_quantity ?? "?"} Get ${
			campaign.free_quantity ?? "?"
		} Free`;
	}

	return formatMoney(String(campaign.discount_value));
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
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	// DB-fresh role — JWT claim goes stale on mid-session role changes.
	const meQuery = useQuery(usersQueries.me());
	const isAdmin = meQuery.data?.role === "admin";
	const queryClient = useQueryClient();
	const { openSheet, closeSheet } = useSheet();

	const campaignsQuery = useQuery(campaignsQueries.list());
	const storesQuery = useQuery(storesQueries.list());

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
			await queryClient.invalidateQueries({ queryKey: campaignsKeys.all });
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
			payload: UpdateCampaignPayload;
		}) => updateCampaign(id, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: campaignsKeys.all });
			closeSheet();
		},
	});

	const archiveMutation = useMutation({
		mutationKey: ["archive-campaign"],
		mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
			updateCampaign(id, { is_active }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: campaignsKeys.all });
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
						defaultValues={toCampaignFormInput(campaign)}
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

	const handleOpenVoucherDetail = useCallback(
		(campaign: Campaign) => {
			openSheet({
				title: `Voucher Codes — ${campaign.code}`,
				content: () => <VoucherCodesSheet campaignId={campaign.id} />,
			});
		},
		[openSheet],
	);

	const columns = useMemo<DataTableColumnDef<Campaign>[]>(
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
				cell: ({ row }) => formatMoney(String(row.original.min_order_total)),
			},
			{
				accessorKey: "max_discount",
				header: "Max Discount",
				cell: ({ row }) =>
					row.original.max_discount
						? formatMoney(String(row.original.max_discount))
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
				id: "mode",
				header: "Mode",
				cell: ({ row }) => {
					if (row.original.redemption_mode === "code") {
						return <Badge variant="info">Voucher</Badge>;
					}
					if (row.original.usage_limit != null) {
						return (
							<Badge variant="outline">{`Cap ${row.original.usage_limit}`}</Badge>
						);
					}
					return "—";
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
						{row.original.redemption_mode === "code" && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleOpenVoucherDetail(row.original)}
								icon={<TicketIcon className="size-4" />}
							>
								Codes
							</Button>
						)}
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
		[archiveMutation, handleOpenEditSheet, handleOpenVoucherDetail, isAdmin],
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
					<CardContent>
						<div className="mb-4 flex flex-wrap items-center gap-2">
							<SelectField
								items={{
									all: "All status",
									active: "Active only",
									expired: "Expired only",
									archived: "Archived only",
								}}
								value={search.status}
								onValueChange={(value) => {
									void navigate({
										search: () => ({
											status: value as CampaignStatus,
										}),
									});
								}}
								className="min-w-40 w-max"
								placeholder="Filter status"
							/>
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
