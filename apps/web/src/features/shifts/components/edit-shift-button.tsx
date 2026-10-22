import { EditRowButton } from "@/components/edit-row-button";
import type { Shift } from "@/features/shifts/api";
import { useEditShift } from "@/features/shifts/hooks/useEditShift";

interface EditShiftButtonProps {
	shift: Shift;
}

export const EditShiftButton = ({ shift }: EditShiftButtonProps) => {
	const editShift = useEditShift();
	return <EditRowButton onClick={() => editShift(shift)} />;
};
