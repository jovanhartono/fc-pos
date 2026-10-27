import { useCallback } from "react";
import type { Shift } from "@/features/shifts/api";
import { EditShiftForm } from "@/features/shifts/components/edit-shift-form";
import { useDialog } from "@/stores/dialog-store";

export const useEditShift = () => {
	const openDialog = useDialog((s) => s.openDialog);
	const closeDialog = useDialog((s) => s.closeDialog);
	return useCallback(
		(shift: Shift) =>
			openDialog({
				title: "Edit Shift",
				description: `${shift.user?.name ?? `User #${shift.user_id}`} · ${shift.store?.code ?? ""}`,
				content: () => <EditShiftForm shift={shift} onDone={closeDialog} />,
			}),
		[openDialog, closeDialog],
	);
};
