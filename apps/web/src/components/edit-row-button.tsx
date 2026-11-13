import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

interface EditRowButtonProps {
	label: string;
	onClick: () => void;
	disabled?: boolean;
}

export const EditRowButton = ({
	label,
	onClick,
	disabled,
}: EditRowButtonProps) => (
	<Button
		variant="outline"
		size="icon-sm"
		aria-label={label}
		title="Edit"
		disabled={disabled}
		onClick={onClick}
		icon={<HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />}
	/>
);
