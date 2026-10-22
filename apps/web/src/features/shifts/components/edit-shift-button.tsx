import { EditRowButton } from "@/components/edit-row-button";
import type { Shift } from "@/features/shifts/api";
import { useEditShift } from "@/features/shifts/hooks/useEditShift";

interface EditShiftButtonProps {
	shift: Shift;
}

// Above the row's own tap target, so Edit opens the Shift, not the sheet.
export const EditShiftButton = ({ shift }: EditShiftButtonProps) => {
	const editShift = useEditShift();
	return (
		<span className="relative z-10">
			<EditRowButton onClick={() => editShift(shift)} />
		</span>
	);
};
