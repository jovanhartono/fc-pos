import {
  AlertCircleIcon,
  CancelCircleIcon,
  CopyLinkIcon,
  DeliveryTruck01Icon,
  Money03Icon,
  MoreVerticalIcon,
  PrinterIcon,
  ReturnRequestIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import { CopyValue } from "@/components/copy-value";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WhatsappIcon } from "@/components/whatsapp-icon";
import { OpenComplaintForm } from "@/features/complaints/components/open-complaint-form";
import { CustomerLink } from "@/features/customers/components/customer-link";
import type { OrderDetail } from "@/features/orders/api";
import { NotifiedLabel } from "@/features/orders/components/notified-label";
import { OrderBadges } from "@/features/orders/components/order-badges";
import { OrderCourierForm } from "@/features/orders/components/order-courier-form";
import { OrderDeliveryFeeForm } from "@/features/orders/components/order-delivery-fee-form";
import {
  CODE_HEADING,
  META_LINE,
} from "@/features/orders/components/order-detail-parts";
import {
  CancelOrderForm,
  RefundOrderForm,
} from "@/features/orders/components/order-line-reversal-form";
import { OrderPickupEventDialog } from "@/features/orders/components/order-pickup-event-dialog";
import { useNotifyCustomer } from "@/features/orders/hooks/useNotifyCustomer";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import type { OrderActionGates } from "@/features/orders/lib/order-action-gates";
import { showsPickupProgress } from "@/features/orders/lib/order-sheet";
import { formatNoticeTime } from "@/features/orders/lib/pickup-notice";
import { buildTrackingUrl } from "@/features/orders/lib/tracking-link";
import { usePrintReceiptMutation } from "@/features/printing/hooks/usePrintReceipt";
import { cn } from "@/lib/utils";
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
  const printReceiptMutation = usePrintReceiptMutation(orderId);
  const notifyCustomer = useNotifyCustomer(orderId);

  const fulfillment = detail.fulfillment;
  const totalCount = fulfillment.total_count;
  // ADR-0017: count Collectable Items, not ready OrderServices. A shoe with its
  // repaint done but its sole swap still in QC has nothing to hand back yet.
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
      toast.error("Couldn't copy tracking link");
    }
  };

  const openPickupDialog = () => {
    openDialog({
      title: "Record Pickup",
      description: "Select the items being collected and attach a photo.",
      size: "wide",
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
      title: "Set Courier",
      description:
        "Assign a courier to collect this order, or leave as walk-in.",
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

  const openDeliveryFeeDialog = () => {
    openDialog({
      title: "Set Delivery Fee",
      description:
        "For fetching and returning the Items. Leave blank for none.",
      content: () => (
        <OrderDeliveryFeeForm
          closeDialog={closeDialog}
          currentDeliveryFee={
            detail.delivery_fee === "0" ? "" : detail.delivery_fee
          }
          orderId={orderId}
        />
      ),
    });
  };

  const openCancelOrderDialog = () => {
    openDialog({
      title: "Cancel Order",
      description: "Select lines to cancel and provide reasons.",
      size: "wide",
      content: () => (
        <CancelOrderForm
          detail={detail}
          lines={gates.cancellableServices}
          products={gates.cancellableProducts}
        />
      ),
    });
  };

  const openRefundOrderDialog = () => {
    openDialog({
      title: "Refund Order",
      description: "Select lines to refund and provide reasons.",
      size: "wide",
      content: () => (
        <RefundOrderForm
          detail={detail}
          lines={gates.refundableServices}
          products={gates.refundableProducts}
        />
      ),
    });
  };

  const openComplaintDialog = () => {
    openDialog({
      title: "Open Complaint",
      description: "Log a customer complaint and optionally start a rework.",
      size: "wide",
      content: () => (
        <OpenComplaintForm
          lines={gates.complaintableServices}
          orderCode={detail.code}
        />
      ),
    });
  };

  const hasMenu =
    Boolean(trackingUrl) ||
    gates.canManageCourier ||
    gates.canEditDeliveryFee ||
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

  const lastNotice = detail.last_pickup_notice;
  const canNotify = detail.status === "ready_for_pickup";
  const renderNotifyButton = (className: string) =>
    canNotify ? (
      <Button
        className={className}
        icon={<HugeiconsIcon icon={WhatsappIcon} className="size-4" />}
        onClick={() =>
          notifyCustomer({
            customerName: detail.customer.name,
            phone: detail.customer.phone_number,
            lastNotice,
          })
        }
        type="button"
        variant={lastNotice ? "outline-success" : "success"}
      >
        {lastNotice ? "Notify Again" : "Notify"}
      </Button>
    ) : null;

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
        <div className="grid gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className={CODE_HEADING}>
                <CopyValue label="order code" value={detail.code} />
              </h1>
              <OrderBadges order={detail} />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {renderNotifyButton("hidden sm:inline-flex")}
              {renderPickupButton("hidden sm:inline-flex")}
              <Button
                icon={<HugeiconsIcon icon={PrinterIcon} className="size-4" />}
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
                        icon={
                          <HugeiconsIcon
                            icon={MoreVerticalIcon}
                            className="size-4"
                          />
                        }
                        size="icon"
                        variant="outline"
                      />
                    }
                  />
                  <DropdownMenuContent
                    align="end"
                    className="w-auto min-w-48 whitespace-nowrap"
                  >
                    {trackingUrl ? (
                      <DropdownMenuItem onClick={handleCopyTrackingLink}>
                        <HugeiconsIcon icon={CopyLinkIcon} className="size-4" />
                        Copy Tracking Link
                      </DropdownMenuItem>
                    ) : null}
                    {gates.canManageCourier ? (
                      <DropdownMenuItem onClick={openCourierDialog}>
                        <HugeiconsIcon
                          icon={DeliveryTruck01Icon}
                          className="size-4"
                        />
                        Set Courier
                      </DropdownMenuItem>
                    ) : null}
                    {gates.canEditDeliveryFee ? (
                      <DropdownMenuItem onClick={openDeliveryFeeDialog}>
                        <HugeiconsIcon icon={Money03Icon} className="size-4" />
                        Set Delivery Fee
                      </DropdownMenuItem>
                    ) : null}
                    {gates.canOpenComplaint ? (
                      <DropdownMenuItem onClick={openComplaintDialog}>
                        <HugeiconsIcon
                          icon={AlertCircleIcon}
                          className="size-4"
                        />
                        Open Complaint
                      </DropdownMenuItem>
                    ) : null}
                    {gates.canRefundWholeOrder ? (
                      <DropdownMenuItem
                        onClick={openRefundOrderDialog}
                        variant="destructive"
                      >
                        <HugeiconsIcon
                          icon={ReturnRequestIcon}
                          className="size-4"
                        />
                        Refund
                      </DropdownMenuItem>
                    ) : null}
                    {gates.canCancelOrder ? (
                      <DropdownMenuItem
                        onClick={openCancelOrderDialog}
                        variant="destructive"
                      >
                        <HugeiconsIcon
                          icon={CancelCircleIcon}
                          className="size-4"
                        />
                        Cancel Order
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>
          <p className={META_LINE}>
            <CustomerLink
              customerId={detail.customer.id}
              name={detail.customer.name}
            />
            {` · ${meta}`}
          </p>
          {lastNotice ? (
            <p className="text-body compact:text-subhead">
              <NotifiedLabel />
              <span className="text-muted-foreground">
                {` · ${formatNoticeTime(lastNotice.sent_at)} · ${lastNotice.sent_by_name}`}
              </span>
            </p>
          ) : null}
        </div>

        {canNotify || collectableCount > 0 ? (
          <div className="flex gap-2 sm:hidden">
            {renderNotifyButton("flex-1")}
            {renderPickupButton("flex-1")}
          </div>
        ) : null}

        {showsPickupProgress(detail.items) ? (
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body compact:text-subhead">
              <span className="tabular-nums">
                Picked up {fulfillment.picked_up_count}/{totalCount}
              </span>
              {fulfillment.remaining_count > 0 ? (
                <span className="text-muted-foreground tabular-nums">
                  {fulfillment.remaining_count} remaining
                </span>
              ) : null}
            </div>
            <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-soft-bar-track">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300",
                  progressWidth === 100 ? "bg-success" : "bg-primary"
                )}
                style={{ width: `${progressWidth}%` }}
              />
            </div>
            {collectableCount > 0 && !gates.canOpenPickup ? (
              <p
                className="text-footnote leading-relaxed text-muted-foreground"
                id="pickup-disabled-reason"
              >
                {gates.pickupDisabledReason ??
                  "You can't record pickups. Ask a cashier."}
              </p>
            ) : null}
          </div>
        ) : null}

        {detail.notes?.trim() ? (
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-footnote font-medium text-muted-foreground">
              Notes
            </p>
            <p className="mt-1 text-body leading-relaxed compact:text-subhead">
              {detail.notes}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
