import {
	ORDER_SERVICE_TRANSITIONS,
	ORDER_TERMINAL_SERVICE_STATUSES,
} from "@fresclean/api/schema";
import { ImageSquareIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OrderPhotoGallery } from "@/features/orders/components/order-photo-gallery";
import { OrderReasonCallout } from "@/features/orders/components/order-reason-callout";
import type { NonTerminalServiceStatus } from "@/features/orders/components/order-service-dialog.types";
import { PhotoUploadDialog } from "@/features/orders/components/photo-upload-dialog";
import { ServiceStatusUpdateButton } from "@/features/orders/components/service-status-update-button";
import { StatusTimeline } from "@/features/orders/components/status-timeline";
import {
	useRefreshOrder,
	useUpdateServiceStatusMutation,
} from "@/features/orders/hooks/useOrderMutations";
import { uploadOrderServicePhoto } from "@/features/orders/utils/photo-upload";
import { deleteOrderServicePhoto } from "@/lib/api";
import { formatOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { orderDetailQueryOptions } from "@/lib/query-options";
import {
	formatCancelReason,
	formatOrderServiceStatus,
	formatRefundReason,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { getCurrentUser } from "@/stores/auth-store";
import { useDialog } from "@/stores/dialog-store";

const TERMINAL_SERVICE_STATUSES = new Set<string>(
	ORDER_TERMINAL_SERVICE_STATUSES,
);

interface DeletePhotoConfirmDialogProps {
	orderId: number;
	serviceId: number;
	photoId: number;
}

const DeletePhotoConfirmDialog = ({
	orderId,
	serviceId,
	photoId,
}: DeletePhotoConfirmDialogProps) => {
	const refreshOrder = useRefreshOrder(orderId);
	const closeDialog = useDialog((s) => s.closeDialog);

	const deletePhotoMutation = useMutation({
		mutationFn: () => deleteOrderServicePhoto(orderId, serviceId, photoId),
		onSuccess: async () => {
			await refreshOrder();
			toast.success("Photo deleted");
			closeDialog();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete photo",
			);
		},
	});

	return (
		<div className="grid gap-4">
			<p className="text-muted-foreground text-sm">
				You can re-upload a replacement if needed.
			</p>
			<div className="flex justify-end gap-2">
				<Button onClick={closeDialog} type="button" variant="outline">
					Cancel
				</Button>
				<Button
					loading={deletePhotoMutation.isPending}
					onClick={() => deletePhotoMutation.mutate()}
					type="button"
					variant="destructive"
				>
					Delete photo
				</Button>
			</div>
		</div>
	);
};

interface OrderServiceDetailProps {
	orderId: number;
	serviceId: number;
	isAdmin: boolean;
}

export const OrderServiceDetail = ({
	orderId,
	serviceId,
	isAdmin,
}: OrderServiceDetailProps) => {
	const user = getCurrentUser();
	const openDialog = useDialog((s) => s.openDialog);
	const [isPhotoUploadOpen, setIsPhotoUploadOpen] = useState(false);
	const refreshOrder = useRefreshOrder(orderId);
	const updateStatusMutation = useUpdateServiceStatusMutation(orderId);

	// Read the service live from the cached order so status changes made in this
	// sheet reflect immediately instead of pinning a frozen prop from open time.
	const detailQuery = useQuery(orderDetailQueryOptions(orderId));
	const service = detailQuery.data?.services.find((s) => s.id === serviceId);

	if (!service) {
		return (
			<p className="text-muted-foreground text-sm">
				This item is no longer part of the order.
			</p>
		);
	}

	// Cancel/refund/pickup must use their dedicated endpoints
	// (payment- and role-gated) — the status endpoint rejects them.
	const availableTransitions = (
		ORDER_SERVICE_TRANSITIONS[service.status] || []
	).filter(
		(nextStatus): nextStatus is NonTerminalServiceStatus =>
			!TERMINAL_SERVICE_STATUSES.has(nextStatus),
	);
	const itemLabel = service.item_code ?? `Service #${service.id}`;

	return (
		<div className="grid gap-5 text-sm">
			<div className="flex flex-wrap items-center gap-2">
				{service.is_priority ? <Badge variant="warning">Priority</Badge> : null}
				<Badge variant={getOrderServiceStatusBadgeVariant(service.status)}>
					{formatOrderServiceStatus(service.status)}
				</Badge>
			</div>

			{availableTransitions.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{availableTransitions.map((nextStatus) => (
						<ServiceStatusUpdateButton
							key={nextStatus}
							nextStatus={nextStatus}
							serviceId={service.id}
							updateStatusMutation={updateStatusMutation}
						/>
					))}
				</div>
			) : null}

			<dl className="grid gap-3 sm:grid-cols-2">
				<div>
					<dt className="text-muted-foreground text-xs">Item</dt>
					<dd className="mt-0.5 font-medium">
						{formatOrderServiceItemDetails(service)}
					</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-xs">Handler</dt>
					<dd className="mt-0.5 font-medium">
						{service.handler?.name ?? "Unassigned"}
					</dd>
				</div>
			</dl>

			{service.status === "cancelled" && service.cancel_reason ? (
				<OrderReasonCallout
					label="Cancel reason"
					note={service.cancel_note}
					reason={formatCancelReason(service.cancel_reason)}
				/>
			) : null}

			{service.status === "refunded" && service.refundItems.length > 0 ? (
				<OrderReasonCallout label="Refund reason">
					<ul className="mt-1 grid gap-1 text-sm">
						{service.refundItems.map((item) => (
							<li key={item.id}>
								<span className="font-medium">
									{formatRefundReason(item.reason)}
								</span>
								{item.note ? (
									<span className="text-muted-foreground"> — {item.note}</span>
								) : null}
							</li>
						))}
					</ul>
				</OrderReasonCallout>
			) : null}

			<div className="border-t pt-4">
				<p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
					Add item photo
				</p>
				<Button
					className="w-full sm:w-auto"
					icon={<ImageSquareIcon className="size-4" />}
					onClick={() => setIsPhotoUploadOpen(true)}
					type="button"
					variant="secondary"
				>
					Add item photo
				</Button>
				<PhotoUploadDialog
					badgeLabel={itemLabel}
					onOpenChange={setIsPhotoUploadOpen}
					onUploaded={refreshOrder}
					open={isPhotoUploadOpen}
					title="Add item photo"
					uploadPhoto={(input) =>
						uploadOrderServicePhoto(orderId, service.id, input)
					}
				/>
			</div>

			<div className="@container space-y-2">
				<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
					Photos ({service.images.length})
				</p>
				{service.images.length > 0 ? (
					<OrderPhotoGallery
						gridClassName="@md:grid-cols-2 @2xl:grid-cols-3"
						items={service.images.map((image) => ({
							...image,
							alt:
								image.note ??
								`Photo for ${service.item_code ?? `service-${service.id}`}`,
							canDelete: isAdmin || image.uploaded_by === user?.id,
						}))}
						onDelete={(photoId) => {
							openDialog({
								title: "Delete photo?",
								description:
									"This hides the photo from the order detail. The image file is retained for audit.",
								content: () => (
									<DeletePhotoConfirmDialog
										orderId={orderId}
										photoId={photoId}
										serviceId={service.id}
									/>
								),
							});
						}}
						thumbnailClassName="bg-muted/30"
						title={`Photos for ${service.item_code ?? `service-${service.id}`}`}
					/>
				) : (
					<p className="text-muted-foreground text-sm">None yet</p>
				)}
			</div>

			<StatusTimeline logs={service.statusLogs} />
		</div>
	);
};
