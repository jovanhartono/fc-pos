import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
	NonCancelServiceStatus,
	UpdateStatusMutation,
} from "./order-service-dialog.types";

interface ServiceStatusConfirmFormProps {
	serviceId: number;
	nextStatus: NonCancelServiceStatus;
	updateStatusMutation: UpdateStatusMutation;
	closeDialog: () => void;
}

export const ServiceStatusConfirmForm = ({
	serviceId,
	nextStatus,
	updateStatusMutation,
	closeDialog,
}: ServiceStatusConfirmFormProps) => {
	const [note, setNote] = useState("");
	const isPending = updateStatusMutation.isPending;

	const handleConfirm = async () => {
		const trimmed = note.trim();
		await updateStatusMutation.mutateAsync({
			serviceId,
			payload: {
				status: nextStatus,
				...(trimmed ? { note: trimmed } : {}),
			},
		});
		closeDialog();
	};

	return (
		<div className="flex flex-col gap-4">
			<Textarea
				placeholder="Optional status note"
				value={note}
				onChange={(event) => setNote(event.target.value)}
			/>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button variant="outline" onClick={closeDialog}>
					Go back
				</Button>
				<Button disabled={isPending} onClick={handleConfirm}>
					{isPending ? "Saving…" : "Confirm Update"}
				</Button>
			</div>
		</div>
	);
};
