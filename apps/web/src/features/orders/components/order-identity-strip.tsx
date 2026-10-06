import {
	DotsThreeVerticalIcon,
	LinkSimpleIcon,
	PrinterIcon,
	TruckIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { CopyValue } from "@/components/copy-value";
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
import { CustomerLink } from "@/features/customers/components/customer-link";
import type { OrderDetail } from "@/features/orders/api";
import { OrderCourierForm } from "@/features/orders/components/order-courier-form";
import {
	CancelOrderForm,
	RefundOrderForm,
} from "@/features/orders/components/order-line-reversal-form";
import { OrderPickupEventDialog } from "@/features/orders/components/order-pickup-event-dialog";
import {
	useCancelOrderMutation,
	useRefundOrderMutation,
} from "@/features/orders/hooks/useOrderMutations";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import type { OrderActionGates } from "@/features/orders/lib/order-action-gates";
import { showsPickupProgress } from "@/features/orders/lib/order-sheet";
import { getPaymentBadges } from "@/features/orders/lib/payment-badges";
import { buildRefundCaps } from "@/features/orders/lib/refund-preview";
import { findWorkshopRework } from "@/features/orders/lib/refund-rework";
import { buildTrackingUrl } from "@/features/orders/lib/tracking-link";
import { usePrintReceiptMutation } from "@/features/printing/hooks/usePrintReceipt";
import {
	formatOrderServiceItemDetails,
	getOrderServiceItemDetails,
} from "@/lib/order-service-item-details";
import { formatOrderStatus, getOrderStatusBadgeVariant } from "@/lib/status";
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
	const refundMutation = useRefundOrderMutation();
	const openComplaintMutation = useOpenComplaintMutation();
	const printReceiptMutation = usePrintReceiptMutation(orderId);

	// The cancel and refund pickers name the pair ("Nike · AF1 · White") and the
	// short tag, so the cashier needn't flip back to the order to match codes.
	const orderPrefix = `${detail.code}-`;
	const toReversalItem = (
		item: { item_code: string } & Parameters<
			typeof getOrderServiceItemDetails
		>[0],
	) => ({
		item_details: getOrderServiceItemDetails(item),
		item_tag: item.item_code.startsWith(orderPrefix)
			? item.item_code.slice(orderPrefix.length)
			: item.item_code,
	});

	const fulfillment = detail.fulfillment;
	const totalCount = fulfillment.total_count;
	// ADR-0017: what leaves the counter is an object, so the button counts
	// collectable Items — not ready treatments. A shoe whose repaint is done but
	// whose sole swap is still in QC contributes a ready treatment and no
	// collectable object, and offering to hand back "1" of it is a lie.
	const collectableCount = gates.collectableItems.length;
	const progressWidth =
		totalCount === 0 ? 0 : (fulfillment.picked_up_count / totalCount) * 100;

	const trackingUrl = (() => {
		const phone = detail.customer.phone_number;
		if (!(detail.code && phone)) {
			return null;
		}
		return buildTrackingUrl(detail.code, phone);
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
					collectableItems={gates.collectableItems}
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
			description: "Select lines to cancel and provide reasons.",
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
						is_rework: Boolean(service.reworkOf),
						...toReversalItem(service.item),
						service_name: service.service?.name ?? "Service",
					}))}
					closeDialog={closeDialog}
				/>
			),
		});
	};

	const openRefundOrderDialog = () => {
		openDialog({
			title: "Refund order",
			description: "Select lines to refund and provide reasons.",
			contentClassName: "sm:max-w-xl",
			content: () => (
				<RefundOrderForm
					capsByLineKey={buildRefundCaps(detail)}
					closeDialog={closeDialog}
					orderId={orderId}
					refundableProducts={gates.refundableProducts.map((item) => ({
						id: item.id,
						name: item.product?.name ?? `Product #${item.product_id}`,
						qty: item.qty,
					}))}
					refundableServices={gates.refundableServices.map((service) => ({
						id: service.id,
						...toReversalItem(service.item),
						service_name: service.service?.name ?? "Service",
						workshopRework: findWorkshopRework(service),
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
						itemCode: service.item.item_code,
						serviceName: service.service?.name ?? "Service",
						details: formatOrderServiceItemDetails(service.item),
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
	const meta = [
		detail.customer.phone_number,
		detail.store?.name,
		formatOrderDateTime(detail.created_at),
		detail.collectedBy ? `Courier: ${detail.collectedBy.name}` : null,
	]
		.filter(Boolean)
		.join(" · ");

	const renderPickupButton = (className: string) =>
		collectableCount > 0 ? (
			<Button
				aria-describedby={
					gates.canOpenPickup ? undefined : "pickup-disabled-reason"
				}
				className={className}
				disabled={!gates.canOpenPickup}
				onClick={openPickupDialog}
				type="button"
			>
				Pick up · {collectableCount}
			</Button>
		) : null;

	return (
		<Card className="mb-4 sm:mb-6">
			<CardContent className="grid gap-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="break-all font-mono font-semibold text-lg tracking-tight sm:text-xl">
								<CopyValue label="order code" value={detail.code} />
							</h1>
							<Badge variant={getOrderStatusBadgeVariant(detail.status)}>
								{formatOrderStatus(detail.status)}
							</Badge>
							{getPaymentBadges(detail).map((badge) => (
								<Badge key={badge.label} variant={badge.variant}>
									{badge.label}
								</Badge>
							))}
						</div>
						<p className="text-muted-foreground text-sm">
							<CustomerLink
								customerId={detail.customer.id}
								name={detail.customer.name}
							/>
							{` · ${meta}`}
						</p>
					</div>

					<div className="flex shrink-0 items-center gap-2">
						{renderPickupButton("hidden sm:inline-flex")}
						<Button
							icon={<PrinterIcon className="size-4" />}
							loading={printReceiptMutation.isPending}
							onClick={() => printReceiptMutation.mutate()}
							type="button"
							variant="outline"
						>
							Print
						</Button>
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
									{gates.canRefundWholeOrder ? (
										<DropdownMenuItem
											onClick={openRefundOrderDialog}
											variant="destructive"
										>
											Refund
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
								</DropdownMenuContent>
							</DropdownMenu>
						) : null}
					</div>
				</div>

				{renderPickupButton("w-full sm:hidden")}

				{showsPickupProgress(detail.items) ? (
					<div className="grid gap-1.5">
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
							<span className="tabular-nums">
								Items picked up:{" "}
								<span className="font-medium">
									{fulfillment.picked_up_count}
								</span>{" "}
								of {totalCount}
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
						{collectableCount > 0 && !gates.canOpenPickup ? (
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
