import { PencilSimpleLineIcon } from "@phosphor-icons/react";
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
		icon={<PencilSimpleLineIcon className="size-4" />}
	/>
);
