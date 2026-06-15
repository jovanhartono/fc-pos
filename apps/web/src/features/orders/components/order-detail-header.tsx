import { LinkSimpleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CancelOrderForm } from "@/features/orders/components/cancel-order-form";
import { RefundOrderForm } from "@/features/orders/components/refund-order-form";
import {
	useCancelOrderMutation,
	useRefundOrderMutation,
} from "@/features/orders/hooks/useOrderMutations";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import type { OrderActionGates } from "@/features/orders/lib/order-action-gates";
import type { OrderDetail } from "@/lib/api";
import {
	formatOrderStatus,
	formatPaymentStatus,
	formatRefundStatus,
	getOrderStatusBadgeVariant,
	getPaymentStatusBadgeVariant,
	getRefundStatusBadgeVariant,
} from "@/lib/status";
import { useDialog } from "@/stores/dialog-store";

interface OrderDetailHeaderProps {
	orderId: number;
	detail: OrderDetail;
	gates: OrderActionGates;
}

export const OrderDetailHeader = ({
	orderId,
	detail,
	gates,
}: OrderDetailHeaderProps) => {
	const openDialog = useDialog((s) => s.openDialog);
	const closeDialog = useDialog((s) => s.closeDialog);
	const cancelOrderMutation = useCancelOrderMutation(orderId);
	const refundMutation = useRefundOrderMutation(orderId);

	const openCancelOrderDialog = () => {
		openDialog({
			title: "Cancel order",
			description: "Select items to cancel and provide reasons.",
			contentClassName: "sm:max-w-xl",
			content: () => (
				<CancelOrderForm
					closeDialog={closeDialog}
					cancelOrderMutation={cancelOrderMutation}
					cancellableProducts={gates.cancellableProducts.map((item) => ({
						id: item.id,
						name: item.product?.name ?? `Product #${item.product_id}`,
						qty: item.qty,
					}))}
					cancellableServices={gates.cancellableServices.map((service) => ({
						id: service.id,
						item_code: service.item_code ?? null,
					}))}
				/>
			),
		});
	};

	const openRefundOrderDialog = () => {
		openDialog({
			title: "Refund order",
			description: "Select items to refund and provide reasons.",
			contentClassName: "sm:max-w-xl",
			content: () => (
				<RefundOrderForm
					closeDialog={closeDialog}
					orderId={orderId}
					refundableProducts={gates.refundableProducts.map((item) => ({
						id: item.id,
						name: item.product?.name ?? `Product #${item.product_id}`,
						qty: item.qty,
					}))}
					refundableServices={gates.refundableServices.map((service) => ({
						id: service.id,
						item_code: service.item_code ?? null,
					}))}
					refundMutation={refundMutation}
				/>
			),
		});
	};

	const trackingUrl = (() => {
		const phone = detail.customer?.phone_number ?? "";
		if (!detail.code || !phone) {
			return null;
		}
		const origin = typeof window !== "undefined" ? window.location.origin : "";
		const params = new URLSearchParams({ code: detail.code, phone });
		return `${origin}/track?${params.toString()}`;
	})();

	const handleCopyTrackingLink = async () => {
		if (!trackingUrl) {
			return;
		}
		try {
			await navigator.clipboard.writeText(trackingUrl);
			toast.success("Tracking link copied", {
				description: "Paste into WhatsApp to share with the customer.",
			});
		} catch {
			toast.error("Failed to copy tracking link");
		}
	};

	return (
		<div className="text-balance mb-4 space-y-1 sm:mb-6">
			<PageHeader
				className="mb-0"
				title={`Order ${detail.code}`}
				description={detail.customer?.name ?? "Unknown customer"}
				actions={
					<div className="flex w-full max-w-full flex-wrap items-center gap-1.5 sm:justify-end">
						<div className="flex max-w-full flex-wrap items-center gap-1.5">
							{trackingUrl ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									icon={<LinkSimpleIcon className="size-4" />}
									onClick={handleCopyTrackingLink}
								>
									Copy tracking link
								</Button>
							) : null}
							{gates.canCancelOrder && (
								<Button
									type="button"
									variant="destructive"
									size="sm"
									disabled={cancelOrderMutation.isPending}
									onClick={openCancelOrderDialog}
								>
									Cancel order
								</Button>
							)}
							{gates.canRefundWholeOrder && (
								<Button
									type="button"
									variant="destructive"
									size="sm"
									disabled={refundMutation.isPending}
									onClick={openRefundOrderDialog}
								>
									Refund order
								</Button>
							)}
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							<Badge
								className="h-7"
								variant={getOrderStatusBadgeVariant(detail.status)}
							>
								{formatOrderStatus(detail.status)}
							</Badge>
							<Badge
								className="h-7"
								variant={getPaymentStatusBadgeVariant(detail.payment_status)}
							>
								{formatPaymentStatus(detail.payment_status)}
							</Badge>
							{detail.refund_status !== "none" && (
								<Badge
									className="h-7"
									variant={getRefundStatusBadgeVariant(detail.refund_status)}
								>
									{formatRefundStatus(detail.refund_status)}
								</Badge>
							)}
						</div>
					</div>
				}
			/>
			<p className="text-muted-foreground text-sm">
				{detail.store?.name ?? "—"} · {formatOrderDateTime(detail.created_at)}
			</p>
		</div>
	);
};
