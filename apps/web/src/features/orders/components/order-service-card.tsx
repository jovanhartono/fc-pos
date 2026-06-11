import {
	ORDER_SERVICE_TRANSITIONS,
	ORDER_TERMINAL_SERVICE_STATUSES,
} from "@fresclean/api/schema";
import { ImageSquareIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderPhotoGallery } from "@/features/orders/components/order-photo-gallery";
import type { NonTerminalServiceStatus } from "@/features/orders/components/order-service-dialog.types";
import { PhotoUploadDialog } from "@/features/orders/components/photo-upload-dialog";
import { ServiceStatusUpdateButton } from "@/features/orders/components/service-status-update-button";
import { StatusTimeline } from "@/features/orders/components/status-timeline";
import {
	useRefreshOrder,
	useUpdateServiceStatusMutation,
} from "@/features/orders/hooks/useOrderMutations";
import { uploadOrderServicePhoto } from "@/features/orders/utils/photo-upload";
import { deleteOrderServicePhoto, type OrderDetail } from "@/lib/api";
import { formatOrderServiceItemDetails } from "@/lib/order-service-item-details";
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

export type OrderDetailService = OrderDetail["services"][number];

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
			<p className="text-sm text-muted-foreground">
				You can re-upload a replacement if needed.
			</p>
			<div className="flex justify-end gap-2">
				<Button type="button" variant="outline" onClick={closeDialog}>
					Cancel
				</Button>
				<Button
					type="button"
					variant="destructive"
					loading={deletePhotoMutation.isPending}
					onClick={() => deletePhotoMutation.mutate()}
				>
					Delete photo
				</Button>
			</div>
		</div>
	);
};

interface OrderServiceCardProps {
	orderId: number;
	service: OrderDetailService;
	isAdmin: boolean;
}

export const OrderServiceCard = ({
	orderId,
	service,
	isAdmin,
}: OrderServiceCardProps) => {
	const user = getCurrentUser();
	const openDialog = useDialog((s) => s.openDialog);
	const [isPhotoUploadOpen, setIsPhotoUploadOpen] = useState(false);
	const refreshOrder = useRefreshOrder(orderId);
	const updateStatusMutation = useUpdateServiceStatusMutation(orderId);

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
		<Card>
			<CardHeader className="space-y-3 pb-3">
				<div className="flex flex-row items-start justify-between gap-3">
					<div className="min-w-0 space-y-1">
						<CardTitle className="text-base leading-snug">
							{service.item_code ?? `Service #${service.id}`}
						</CardTitle>
						<p className="text-muted-foreground text-sm">
							{service.service?.name ?? "Service"}
						</p>
					</div>
					<div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
						{service.is_priority ? (
							<Badge variant="warning">Priority</Badge>
						) : null}
						<Badge variant={getOrderServiceStatusBadgeVariant(service.status)}>
							{formatOrderServiceStatus(service.status)}
						</Badge>
					</div>
				</div>
				{availableTransitions.length > 0 ? (
					<div className="flex flex-wrap gap-2">
						{availableTransitions.map((nextStatus) => (
							<ServiceStatusUpdateButton
								key={nextStatus}
								serviceId={service.id}
								nextStatus={nextStatus}
								updateStatusMutation={updateStatusMutation}
							/>
						))}
					</div>
				) : null}
			</CardHeader>
			<CardContent className="space-y-5 text-sm">
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
					<div className="border-destructive/40 bg-destructive/5 border p-3">
						<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
							Cancel reason
						</p>
						<p className="mt-1 text-sm font-medium">
							{formatCancelReason(service.cancel_reason)}
						</p>
						{service.cancel_note ? (
							<p className="text-muted-foreground mt-1 text-sm">
								{service.cancel_note}
							</p>
						) : null}
					</div>
				) : null}

				{service.status === "refunded" && service.refundItems.length > 0 ? (
					<div className="border-destructive/40 bg-destructive/5 border p-3">
						<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
							Refund reason
						</p>
						<ul className="mt-1 grid gap-1 text-sm">
							{service.refundItems.map((item) => (
								<li key={item.id}>
									<span className="font-medium">
										{formatRefundReason(item.reason)}
									</span>
									{item.note ? (
										<span className="text-muted-foreground">
											{" "}
											— {item.note}
										</span>
									) : null}
								</li>
							))}
						</ul>
					</div>
				) : null}

				<div className="border-t pt-4">
					<p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
						Add item photo
					</p>
					<Button
						type="button"
						variant="secondary"
						className="w-full sm:w-auto"
						icon={<ImageSquareIcon className="size-4" />}
						onClick={() => setIsPhotoUploadOpen(true)}
					>
						Add item photo
					</Button>
					<PhotoUploadDialog
						open={isPhotoUploadOpen}
						onOpenChange={setIsPhotoUploadOpen}
						title="Add item photo"
						badgeLabel={itemLabel}
						uploadPhoto={(input) =>
							uploadOrderServicePhoto(orderId, service.id, input)
						}
						onUploaded={refreshOrder}
					/>
				</div>

				<div className="@container space-y-2">
					<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
						Photos ({service.images.length})
					</p>
					{service.images.length > 0 ? (
						<OrderPhotoGallery
							items={service.images.map((image) => ({
								...image,
								alt:
									image.note ??
									`Photo for ${service.item_code ?? `service-${service.id}`}`,
								canDelete: isAdmin || image.uploaded_by === user?.id,
							}))}
							gridClassName="@md:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4"
							thumbnailClassName="bg-muted/30"
							title={`Photos for ${service.item_code ?? `service-${service.id}`}`}
							onDelete={(photoId) => {
								openDialog({
									title: "Delete photo?",
									description:
										"This hides the photo from the order detail. The image file is retained for audit.",
									content: () => (
										<DeletePhotoConfirmDialog
											orderId={orderId}
											serviceId={service.id}
											photoId={photoId}
										/>
									),
								});
							}}
						/>
					) : (
						<p className="text-muted-foreground text-sm">None yet</p>
					)}
				</div>

				<StatusTimeline logs={service.statusLogs} />
			</CardContent>
		</Card>
	);
};
