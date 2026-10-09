import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type {
	NonTerminalServiceStatus,
	UpdateStatusMutation,
} from "./order-service-dialog.types";

interface ServiceStatusConfirmFormProps {
	serviceId: number;
	nextStatus: NonTerminalServiceStatus;
	updateStatusMutation: UpdateStatusMutation;
	closeDialog: () => void;
}

export const ServiceStatusConfirmForm = ({
	serviceId,
	nextStatus,
	updateStatusMutation,
	closeDialog,
}: ServiceStatusConfirmFormProps) => {
	const noteId = useId();
	const [note, setNote] = useState("");
	const isPending = updateStatusMutation.isPending;
	const isReject = nextStatus === "qc_reject";
	const trimmed = note.trim();

	const handleConfirm = async () => {
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
			{isReject ? (
				<Field>
					<FieldLabel htmlFor={noteId}>What's wrong?</FieldLabel>
					<Textarea
						id={noteId}
						placeholder="e.g. stain on toe box"
						value={note}
						onChange={(event) => setNote(event.target.value)}
					/>
				</Field>
			) : (
				<Textarea
					placeholder="Optional status note"
					value={note}
					onChange={(event) => setNote(event.target.value)}
				/>
			)}
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button variant="outline" onClick={closeDialog}>
					Go back
				</Button>
				<Button
					disabled={isPending || (isReject && !trimmed)}
					onClick={handleConfirm}
				>
					{isPending ? "Saving…" : isReject ? "Reject" : "Confirm Update"}
				</Button>
			</div>
		</div>
	);
};
