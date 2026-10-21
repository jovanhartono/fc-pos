import { Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

// Each tab owns its CSV, but the button lands in the page header beside Filters,
// so the admin finds Export in the same place on every tab.
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
