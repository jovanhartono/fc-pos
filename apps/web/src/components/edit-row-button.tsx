import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

interface EditRowButtonProps {
	onClick: () => void;
	disabled?: boolean;
}

export const EditRowButton = ({ onClick, disabled }: EditRowButtonProps) => (
	<Button
		variant="outline"
		size="icon-sm"
		aria-label="Edit"
		title="Edit"
		disabled={disabled}
		onClick={onClick}
		icon={<HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />}
	/>
);
