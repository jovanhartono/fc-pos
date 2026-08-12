import { Button } from "@/components/ui/button";
import { RefundOrderForm } from "@/features/orders/components/order-line-reversal-form";
import { useRefundOrderMutation } from "@/features/orders/hooks/useOrderMutations";
import type { OrderActionGates } from "@/features/orders/lib/order-action-gates";
import { buildRefundCaps } from "@/features/orders/lib/refund-preview";
import type { OrderDetail } from "@/lib/api";
import { useDialog } from "@/stores/dialog-store";

interface OrderRefundActionProps {
	orderId: number;
	detail: OrderDetail;
	gates: OrderActionGates;
}

export const OrderRefundAction = ({
	orderId,
	detail,
	gates,
}: OrderRefundActionProps) => {
	const openDialog = useDialog((s) => s.openDialog);
	const closeDialog = useDialog((s) => s.closeDialog);
	const refundMutation = useRefundOrderMutation(orderId);

	if (!gates.canRefundWholeOrder) {
		return null;
	}

	const openRefundOrderDialog = () => {
		openDialog({
			title: "Refund order",
			description: "Select items to refund and provide reasons.",
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
						item_code: service.item_code ?? null,
					}))}
					refundMutation={refundMutation}
				/>
			),
		});
	};

	return (
		<div className="border-t px-4 py-3">
			<Button
				className="border-destructive/40"
				onClick={openRefundOrderDialog}
				type="button"
				variant="destructive"
			>
				Refund order
			</Button>
		</div>
	);
};
