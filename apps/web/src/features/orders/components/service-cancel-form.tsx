import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { UpdateStatusMutation } from "./order-service-dialog.types";

interface ServiceCancelFormProps {
	serviceId: number;
	updateStatusMutation: UpdateStatusMutation;
	closeDialog: () => void;
}

export const ServiceCancelForm = ({
	serviceId,
	updateStatusMutation,
	closeDialog,
}: ServiceCancelFormProps) => {
	const [reason, setReason] = useState("");
	const trimmed = reason.trim();
	const isPending = updateStatusMutation.isPending;

	const handleConfirm = async () => {
		await updateStatusMutation.mutateAsync({
			serviceId,
			payload: { status: "cancelled", cancel_reason: trimmed },
		});
		closeDialog();
	};

	return (
		<div className="flex flex-col gap-4">
			<Textarea
				placeholder="Cancel reason (required)"
				value={reason}
				onChange={(event) => setReason(event.target.value)}
			/>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button variant="outline" onClick={closeDialog}>
					Go back
				</Button>
				<Button
					variant="destructive"
					disabled={isPending || !trimmed}
					onClick={handleConfirm}
				>
					{isPending ? "Saving…" : "Confirm Cancel"}
				</Button>
			</div>
		</div>
	);
};
