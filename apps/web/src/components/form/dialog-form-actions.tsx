import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface DialogFormActionsProps {
	// The form's own main button, full width on top.
	submit: ReactNode;
	onCancel: () => void;
	cancelLabel?: string;
	isPending?: boolean;
}

// Every form in a dialog ends the same way, so staff always find the main
// action in one place and the way out under it.
export const DialogFormActions = ({
	submit,
	onCancel,
	cancelLabel = "Cancel",
	isPending = false,
}: DialogFormActionsProps) => (
	<div className="grid gap-2">
		{submit}
		<Button
			type="button"
			variant="ghost"
			onClick={onCancel}
			disabled={isPending}
		>
			{cancelLabel}
		</Button>
	</div>
);
