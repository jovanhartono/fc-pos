import { EditRowButton } from "@/components/edit-row-button";
import type { Shift } from "@/features/shifts/api";
import { useEditShift } from "@/features/shifts/hooks/useEditShift";
import { shiftSummary } from "@/features/shifts/lib/shift-times";

interface EditShiftButtonProps {
	shift: Shift;
}

export const EditShiftButton = ({ shift }: EditShiftButtonProps) => {
	const editShift = useEditShift();
	return (
		<EditRowButton
			label={`Edit Shift, ${shiftSummary(shift)}`}
			onClick={() => editShift(shift)}
		/>
	);
};
