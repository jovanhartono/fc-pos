import { useId, useState } from "react";
import { DialogFormActions } from "@/components/form/dialog-form-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateServiceStatusMutation } from "@/features/orders/hooks/useOrderMutations";
import type { NonTerminalServiceStatus } from "@/features/orders/lib/order-service-actions";
import { useDialog } from "@/stores/dialog-store";

interface ServiceStatusConfirmFormProps {
	orderId: number;
	serviceId: number;
	nextStatus: NonTerminalServiceStatus;
}

export const ServiceStatusConfirmForm = ({
	orderId,
	serviceId,
	nextStatus,
}: ServiceStatusConfirmFormProps) => {
	const closeDialog = useDialog((s) => s.closeDialog);
	const updateStatusMutation = useUpdateServiceStatusMutation(orderId);
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
					<FieldLabel htmlFor={noteId}>Reject reason</FieldLabel>
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
			<DialogFormActions
				submit={
					<Button
						disabled={isPending || (isReject && !trimmed)}
						onClick={handleConfirm}
					>
						{isPending ? "Saving…" : isReject ? "Reject" : "Confirm Update"}
					</Button>
				}
				onCancel={closeDialog}
			/>
		</div>
	);
};
