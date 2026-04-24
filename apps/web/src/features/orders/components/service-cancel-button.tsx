import { Button } from "@/components/ui/button";
import { useDialog } from "@/stores/dialog-store";
import {
	STATUS_ACTION_LABELS,
	type UpdateStatusMutation,
} from "./order-service-dialog.types";
import { ServiceCancelForm } from "./service-cancel-form";

interface ServiceCancelButtonProps {
	serviceId: number;
	updateStatusMutation: UpdateStatusMutation;
}

export const ServiceCancelButton = ({
	serviceId,
	updateStatusMutation,
}: ServiceCancelButtonProps) => {
	const openDialog = useDialog((s) => s.openDialog);
	const closeDialog = useDialog((s) => s.closeDialog);

	const handleClick = () => {
		openDialog({
			title: "Cancel Service",
			description: "Please provide a reason for cancelling this service.",
			content: () => (
				<ServiceCancelForm
					serviceId={serviceId}
					updateStatusMutation={updateStatusMutation}
					closeDialog={closeDialog}
				/>
			),
		});
	};

	return (
		<Button variant="destructive" size="sm" onClick={handleClick}>
			{STATUS_ACTION_LABELS.cancelled}
		</Button>
	);
};
