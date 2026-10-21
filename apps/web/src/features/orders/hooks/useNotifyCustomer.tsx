import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WhatsappIcon } from "@/components/whatsapp-icon";
import {
	createOrderPickupNotice,
	type OrderDetail,
	type OrderReceipt,
	ordersQueries,
} from "@/features/orders/api";
import {
	buildPickupNoticeMessage,
	formatNoticeTime,
	whatsappUrl,
} from "@/features/orders/lib/pickup-notice";
import { buildTrackingUrl } from "@/features/orders/lib/tracking-link";
import { onOrderMoved } from "@/lib/cache-events";
import { parseMoney } from "@/shared/money";
import { useDialog } from "@/stores/dialog-store";

interface NotifyCustomerTarget {
	customerName: string;
	phone: string;
	lastNotice: OrderDetail["last_pickup_notice"];
}

interface NotifyCustomerFooterProps {
	label: string;
	onConfirm: (receipt: OrderReceipt) => void;
	orderId: number;
}

const NotifyCustomerFooter = ({
	label,
	onConfirm,
	orderId,
}: NotifyCustomerFooterProps) => {
	const closeDialog = useDialog((s) => s.closeDialog);
	// The Pickup code only comes with the receipt read (ADR-0016), and WhatsApp
	// has to open inside the tap, so the code is fetched while the dialog is up.
	const receiptQuery = useQuery(ordersQueries.receipt(orderId));
	const confirmedRef = useRef(false);

	return (
		<>
			<Button onClick={closeDialog} type="button" variant="outline">
				Cancel
			</Button>
			{receiptQuery.isError ? (
				<Button
					loading={receiptQuery.isFetching}
					onClick={() => receiptQuery.refetch()}
					type="button"
					variant="success"
				>
					Try again
				</Button>
			) : (
				<Button
					disabled={!receiptQuery.data}
					icon={<HugeiconsIcon icon={WhatsappIcon} className="size-4" />}
					loading={receiptQuery.isPending}
					onClick={() => {
						if (confirmedRef.current || !receiptQuery.data) {
							return;
						}
						confirmedRef.current = true;
						onConfirm(receiptQuery.data);
					}}
					type="button"
					variant="success"
				>
					{label}
				</Button>
			)}
		</>
	);
};

export const useNotifyCustomer = (orderId: number) => {
	const queryClient = useQueryClient();
	const openDialog = useDialog((s) => s.openDialog);
	const closeDialog = useDialog((s) => s.closeDialog);

	const mutation = useMutation({
		mutationFn: (_customerName: string) => createOrderPickupNotice(orderId),
		onSuccess: async (_data, customerName) => {
			toast.success(`${customerName} notified`);
			await onOrderMoved(queryClient);
		},
		// WhatsApp already opened, so retrying only saves the record; tapping
		// Notify again would send the Customer a second message.
		onError: (_error, customerName) => {
			toast.error("Sent, but not saved.", {
				action: {
					label: "Save again",
					onClick: () => mutation.mutate(customerName),
				},
				duration: Number.POSITIVE_INFINITY,
			});
		},
	});

	const handleConfirm = (receipt: OrderReceipt) => {
		const message = buildPickupNoticeMessage({
			customerName: receipt.customer.name,
			orderCode: receipt.code,
			pickupCode: receipt.pickup_code,
			// What the Customer owes, matching the Total on their printed Receipt.
			total: parseMoney(receipt.total) - parseMoney(receipt.discount),
			isPaid: receipt.payment_status === "paid",
			trackingUrl: buildTrackingUrl(
				receipt.code,
				receipt.customer.phone_number,
			),
		});
		// iOS only lets a tap open a new tab before anything is awaited.
		window.open(whatsappUrl(receipt.customer.phone_number, message), "_blank");
		closeDialog();
		mutation.mutate(receipt.customer.name);
	};

	return ({ customerName, phone, lastNotice }: NotifyCustomerTarget) => {
		const label = lastNotice ? "Notify again" : "Notify";
		openDialog({
			title: lastNotice
				? `Notify ${customerName} again?`
				: `Notify ${customerName}?`,
			description: lastNotice
				? `Notified ${formatNoticeTime(lastNotice.sent_at)} by ${lastNotice.sent_by_name}. Opens WhatsApp with the same message again.`
				: `Opens WhatsApp to ${phone} with the pickup message and marks this Order notified.`,
			footer: () => (
				<NotifyCustomerFooter
					label={label}
					onConfirm={handleConfirm}
					orderId={orderId}
				/>
			),
		});
	};
};
