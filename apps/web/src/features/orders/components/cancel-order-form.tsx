import type { UseMutationResult } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type CancelOrderMutation = UseMutationResult<unknown, Error, string, unknown>;

interface CancelOrderFormProps {
	closeDialog: () => void;
	cancelOrderMutation: CancelOrderMutation;
}

export const CancelOrderForm = ({
	closeDialog,
	cancelOrderMutation,
}: CancelOrderFormProps) => {
	const [reason, setReason] = useState("");
	const trimmed = reason.trim();
	const isPending = cancelOrderMutation.isPending;

	const handleConfirm = async () => {
		await cancelOrderMutation.mutateAsync(trimmed);
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
					{isPending ? "Cancelling…" : "Confirm Cancel Order"}
				</Button>
			</div>
		</div>
	);
};
