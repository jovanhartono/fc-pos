import { Button } from "@/components/ui/button";
import type { NonTerminalServiceStatus } from "@/features/orders/lib/order-service-actions";
import { useDialog } from "@/stores/dialog-store";
import { STATUS_ACTION_LABELS } from "./order-service-dialog.types";
import { ServiceStatusConfirmForm } from "./service-status-confirm-form";

interface ServiceStatusUpdateButtonProps {
	orderId: number;
	serviceId: number;
	nextStatus: NonTerminalServiceStatus;
	disabled?: boolean;
}

export const ServiceStatusUpdateButton = ({
	orderId,
	serviceId,
	nextStatus,
	disabled,
}: ServiceStatusUpdateButtonProps) => {
	const openDialog = useDialog((s) => s.openDialog);

	const handleClick = () => {
		if (disabled) {
			return;
		}
		openDialog({
			title: `Update Status to ${STATUS_ACTION_LABELS[nextStatus]}`,
			description: `Set status to ${STATUS_ACTION_LABELS[nextStatus]}?`,
			content: () => (
				<ServiceStatusConfirmForm
					nextStatus={nextStatus}
					orderId={orderId}
					serviceId={serviceId}
				/>
			),
		});
	};

	return (
		<Button
			disabled={disabled}
			onClick={handleClick}
			size="sm"
			variant="secondary"
		>
			{STATUS_ACTION_LABELS[nextStatus]}
		</Button>
	);
};
