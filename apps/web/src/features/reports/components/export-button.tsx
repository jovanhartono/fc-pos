import { Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

// The page header's spot beside Filters. Each tab owns its own CSV, so the
// button renders inside the tab and lands up there, in the same place on
// every tab instead of wherever that tab's layout had room.
export const ExportSlotContext = createContext<HTMLElement | null>(null);

interface ExportButtonProps {
	disabled?: boolean;
	onClick: () => void;
}

export const ExportButton = ({ disabled, onClick }: ExportButtonProps) => {
	const slot = useContext(ExportSlotContext);
	if (!slot) {
		return null;
	}
	return createPortal(
		<Button
			type="button"
			variant="outline"
			disabled={disabled}
			onClick={onClick}
			// Square and outlined like the Filters button beside it.
			className="w-9 px-0 pointer-coarse:w-11"
			aria-label="Export CSV"
			icon={<HugeiconsIcon icon={Download04Icon} />}
		/>,
		slot,
	);
};
