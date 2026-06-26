import { Button } from "@/components/ui/button";
import { useDialog } from "@/stores/dialog-store";
import {
	type NonTerminalServiceStatus,
	STATUS_ACTION_LABELS,
	type UpdateStatusMutation,
} from "./order-service-dialog.types";
import { ServiceStatusConfirmForm } from "./service-status-confirm-form";

interface ServiceStatusUpdateButtonProps {
	serviceId: number;
	nextStatus: NonTerminalServiceStatus;
	updateStatusMutation: UpdateStatusMutation;
	disabled?: boolean;
}

export const ServiceStatusUpdateButton = ({
	serviceId,
	nextStatus,
	updateStatusMutation,
	disabled,
}: ServiceStatusUpdateButtonProps) => {
	const openDialog = useDialog((s) => s.openDialog);
	const closeDialog = useDialog((s) => s.closeDialog);

	const handleClick = () => {
		if (disabled) {
			return;
		}
		openDialog({
			title: `Update Status to ${STATUS_ACTION_LABELS[nextStatus]}`,
			description: `Are you sure you want to change the status to ${STATUS_ACTION_LABELS[nextStatus]}?`,
			content: () => (
				<ServiceStatusConfirmForm
					serviceId={serviceId}
					nextStatus={nextStatus}
					updateStatusMutation={updateStatusMutation}
					closeDialog={closeDialog}
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
