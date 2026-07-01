import {
	DotsThreeVerticalIcon,
	LinkSimpleIcon,
	TruckIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OpenComplaintForm } from "@/features/complaints/components/open-complaint-form";
import { useOpenComplaintMutation } from "@/features/complaints/hooks/useComplaintMutations";
import { CancelOrderForm } from "@/features/orders/components/cancel-order-form";
import { OrderCourierForm } from "@/features/orders/components/order-courier-form";
import { OrderPickupEventDialog } from "@/features/orders/components/order-pickup-event-dialog";
import { PaymentStatusBadge } from "@/features/orders/components/payment-status-badge";
import { RefundOrderForm } from "@/features/orders/components/refund-order-form";
import {
	useCancelOrderMutation,
	useRefundOrderMutation,
} from "@/features/orders/hooks/useOrderMutations";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import type { OrderActionGates } from "@/features/orders/lib/order-action-gates";
import type { OrderDetail } from "@/lib/api";
import { formatOrderServiceItemDetails } from "@/lib/order-service-item-details";
import {
	formatOrderStatus,
	formatRefundStatus,
	getOrderStatusBadgeVariant,
	getRefundStatusBadgeVariant,
} from "@/lib/status";
import { useDialog } from "@/stores/dialog-store";

interface OrderIdentityStripProps {
	orderId: number;
	detail: OrderDetail;
	gates: OrderActionGates;
}

export const OrderIdentityStrip = ({
	orderId,
	detail,
	gates,
}: OrderIdentityStripProps) => {
	const openDialog = useDialog((s) => s.openDialog);
	const closeDialog = useDialog((s) => s.closeDialog);
	const cancelOrderMutation = useCancelOrderMutation(orderId);
	const refundMutation = useRefundOrderMutation(orderId);
	const openComplaintMutation = useOpenComplaintMutation(orderId);

	const fulfillment = detail.fulfillment;
	const totalCount = fulfillment.service_total_count;
	const readyCount = fulfillment.ready_for_pickup_count;
	const progressWidth =
		totalCount === 0 ? 0 : (fulfillment.picked_up_count / totalCount) * 100;

	const trackingUrl = (() => {
		const phone = detail.customer?.phone_number ?? "";
		if (!(detail.code && phone)) {
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

	const openPickupDialog = () => {
		openDialog({
			title: "Record pickup",
			description: "Select the items being collected and attach a photo.",
			contentClassName: "sm:max-w-xl",
			content: () => (
				<OrderPickupEventDialog
					closeDialog={closeDialog}
					orderId={orderId}
					readyServices={gates.readyForPickupServices}
				/>
			),
		});
	};

	const openCourierDialog = () => {
		openDialog({
			title: "Set courier",
			description:
				"Assign a courier to collect this order, or leave as walk-in.",
			contentClassName: "sm:max-w-md",
			content: () => (
				<OrderCourierForm
					closeDialog={closeDialog}
					currentCourierId={
						detail.collected_by ? String(detail.collected_by) : ""
					}
					orderId={orderId}
				/>
			),
		});
	};

	const openCancelOrderDialog = () => {
		openDialog({
			title: "Cancel order",
			description: "Select items to cancel and provide reasons.",
			contentClassName: "sm:max-w-xl",
			content: () => (
				<CancelOrderForm
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
					closeDialog={closeDialog}
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

	const openComplaintDialog = () => {
		openDialog({
			title: "Open complaint",
			description: "Log a customer complaint and optionally start a rework.",
			contentClassName: "sm:max-w-2xl",
			content: () => (
				<OpenComplaintForm
					closeDialog={closeDialog}
					lines={gates.complaintableServices.map((service) => ({
						id: service.id,
						itemCode: service.item_code ?? `#${service.id}`,
						serviceName: service.service?.name ?? "Service",
						details: formatOrderServiceItemDetails(service),
					}))}
					mutation={openComplaintMutation}
				/>
			),
		});
	};

	const hasMenu =
		Boolean(trackingUrl) ||
		gates.canManageCourier ||
		gates.canCancelOrder ||
		gates.canRefundWholeOrder ||
		gates.canOpenComplaint;
	const showActions = readyCount > 0 || hasMenu;
	const meta = [
		detail.customer?.name,
		detail.customer?.phone_number,
		detail.store?.name,
		formatOrderDateTime(detail.created_at),
		detail.collectedBy ? `Courier: ${detail.collectedBy.name}` : null,
	]
		.filter(Boolean)
		.join(" · ");

	const renderPickupButton = (className: string) =>
		readyCount > 0 ? (
			<Button
				aria-describedby={
					gates.canOpenPickup ? undefined : "pickup-disabled-reason"
				}
				className={className}
				disabled={!gates.canOpenPickup}
				onClick={openPickupDialog}
				type="button"
			>
				Pick up · {readyCount}
			</Button>
		) : null;

	return (
		<Card className="mb-4 sm:mb-6">
			<CardContent className="grid gap-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="break-all font-mono font-semibold text-lg tracking-tight sm:text-xl">
								{detail.code}
							</h1>
							<Badge variant={getOrderStatusBadgeVariant(detail.status)}>
								{formatOrderStatus(detail.status)}
							</Badge>
							<PaymentStatusBadge status={detail.payment_status} />
							{detail.refund_status !== "none" ? (
								<Badge
									variant={getRefundStatusBadgeVariant(detail.refund_status)}
								>
									{formatRefundStatus(detail.refund_status)}
								</Badge>
							) : null}
						</div>
						<p className="text-muted-foreground text-sm">{meta}</p>
					</div>

					{showActions ? (
						<div className="flex shrink-0 items-center gap-2">
							{renderPickupButton("hidden sm:inline-flex")}
							{hasMenu ? (
								<DropdownMenu>
									<DropdownMenuTrigger
										render={
											<Button
												aria-label="More actions"
												icon={<DotsThreeVerticalIcon className="size-4" />}
												size="icon"
												variant="outline"
											/>
										}
									/>
									<DropdownMenuContent align="end" className="w-40">
										{trackingUrl ? (
											<DropdownMenuItem onClick={handleCopyTrackingLink}>
												<LinkSimpleIcon className="size-4" />
												Copy tracking link
											</DropdownMenuItem>
										) : null}
										{gates.canManageCourier ? (
											<DropdownMenuItem onClick={openCourierDialog}>
												<TruckIcon className="size-4" />
												Set courier
											</DropdownMenuItem>
										) : null}
										{gates.canOpenComplaint ? (
											<DropdownMenuItem onClick={openComplaintDialog}>
												<WarningCircleIcon className="size-4" />
												Open complaint
											</DropdownMenuItem>
										) : null}
										{gates.canCancelOrder ? (
											<DropdownMenuItem
												onClick={openCancelOrderDialog}
												variant="destructive"
											>
												Cancel order
											</DropdownMenuItem>
										) : null}
										{gates.canRefundWholeOrder ? (
											<DropdownMenuItem
												onClick={openRefundOrderDialog}
												variant="destructive"
											>
												Refund order
											</DropdownMenuItem>
										) : null}
									</DropdownMenuContent>
								</DropdownMenu>
							) : null}
						</div>
					) : null}
				</div>

				{renderPickupButton("w-full sm:hidden")}

				{totalCount > 0 ? (
					<div className="grid gap-1.5">
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
							<span className="tabular-nums">
								<span className="font-medium">
									{fulfillment.picked_up_count}
								</span>{" "}
								of {totalCount} picked up
							</span>
							{fulfillment.remaining_count > 0 ? (
								<span className="text-muted-foreground tabular-nums">
									{fulfillment.remaining_count} remaining
								</span>
							) : null}
						</div>
						<div className="h-1.5 w-full max-w-md overflow-hidden bg-muted">
							<div
								className="h-full bg-primary transition-[width] duration-300"
								style={{ width: `${progressWidth}%` }}
							/>
						</div>
						{readyCount > 0 && !gates.canOpenPickup ? (
							<p
								className="text-muted-foreground text-xs leading-relaxed"
								id="pickup-disabled-reason"
							>
								{gates.pickupDisabledReason ?? "Pickup unavailable."}
							</p>
						) : null}
					</div>
				) : null}

				{detail.notes?.trim() ? (
					<div className="border bg-muted/30 p-3">
						<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
							Notes
						</p>
						<p className="mt-1 text-sm leading-relaxed">{detail.notes}</p>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
};
