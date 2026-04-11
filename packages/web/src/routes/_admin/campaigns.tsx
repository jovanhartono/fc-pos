import {
	PencilSimpleLineIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
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
	deleteCampaign,
	queryKeys,
	updateCampaign,
} from "@/lib/api";
import {
	campaignsPageQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";
import { getCurrentUser } from "@/stores/auth-store";
import { useDialog } from "@/stores/dialog-store";
import { useSheet } from "@/stores/sheet-store";

const campaignsSearchSchema = z.object({
	page: z.coerce.number().int().positive().catch(1),
	status: z.enum(["all", "active", "inactive"]).catch("all"),
});

const PAGE_SIZE = 25;

export const Route = createFileRoute("/_admin/campaigns")({
	validateSearch: (search) => campaignsSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		Promise.all([
			context.queryClient.ensureQueryData(
				campaignsPageQueryOptions(
					deps.status === "all"
						? { limit: PAGE_SIZE, offset: (deps.page - 1) * PAGE_SIZE }
						: {
								is_active: deps.status === "active",
								limit: PAGE_SIZE,
								offset: (deps.page - 1) * PAGE_SIZE,
							},
				),
			),
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

function DeleteCampaignButton({
	campaign,
	disabled,
	isPending,
	onConfirm,
}: {
	campaign: Campaign;
	disabled: boolean;
	isPending: boolean;
	onConfirm: (campaignId: number) => Promise<void>;
}) {
	const { openDialog, closeDialog } = useDialog();

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={disabled || isPending}
			icon={<TrashIcon className="size-4" />}
			onClick={() => {
				openDialog({
					title: "Delete campaign?",
					description: `Delete ${campaign.code} (${campaign.name})? This cannot be undone.`,
					footer: () => (
						<>
							<Button variant="outline" onClick={closeDialog}>
								Cancel
							</Button>
							<Button
								variant="destructive"
								disabled={isPending}
								onClick={async () => {
									await onConfirm(campaign.id);
									closeDialog();
								}}
							>
								Delete campaign
							</Button>
						</>
					),
				});
			}}
		>
			Delete
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

	const campaignQueryFilters =
		search.status === "all"
			? { limit: PAGE_SIZE, offset: (search.page - 1) * PAGE_SIZE }
			: {
					is_active: search.status === "active",
					limit: PAGE_SIZE,
					offset: (search.page - 1) * PAGE_SIZE,
				};

	const campaignsQuery = useQuery(
		campaignsPageQueryOptions(campaignQueryFilters),
	);

	const storesQuery = useQuery(storesQueryOptions());

	const stores = storesQuery.data ?? [];
	const campaigns = campaignsQuery.data?.items ?? [];
	const campaignsMeta = campaignsQuery.data?.meta;

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

	const deleteMutation = useMutation({
		mutationKey: ["delete-campaign"],
		mutationFn: (id: number) => deleteCampaign(id),
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
						: "-",
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
				cell: ({ row }) => (
					<Badge variant={row.original.is_active ? "success" : "danger"}>
						{row.original.is_active ? "Active" : "Inactive"}
					</Badge>
				),
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
						<DeleteCampaignButton
							campaign={row.original}
							disabled={!isAdmin}
							isPending={deleteMutation.isPending}
							onConfirm={async (campaignId) => {
								await deleteMutation.mutateAsync(campaignId);
							}}
						/>
					</div>
				),
			},
		],
		[deleteMutation, handleOpenEditSheet, isAdmin],
	);

	return (
		<>
			<PageHeader
				title="Campaigns"
				actions={
					<>
						<Badge variant={campaignsQuery.isPending ? "secondary" : "outline"}>
							{`${campaignsMeta?.total ?? 0} items`}
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
										search: (prev) => ({
											...prev,
											page: 1,
											status:
												(value as z.infer<
													typeof campaignsSearchSchema
												>["status"]) ?? "all",
										}),
									});
								}}
							>
								<SelectTrigger className="h-10 min-w-40 w-max">
									<SelectValue placeholder="Filter status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All status</SelectItem>
									<SelectItem value="active">Active only</SelectItem>
									<SelectItem value="inactive">Inactive only</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="grid gap-4">
							<DataTable
								columns={columns}
								data={campaigns}
								isLoading={campaignsQuery.isPending || storesQuery.isPending}
							/>
							<TablePagination
								meta={campaignsMeta}
								isLoading={campaignsQuery.isPending}
								onPageChange={(page) => {
									void navigate({
										search: (prev) => ({
											...prev,
											page,
										}),
									});
								}}
							/>
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
