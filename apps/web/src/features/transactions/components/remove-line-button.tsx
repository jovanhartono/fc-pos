import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

interface RemoveLineButtonProps {
	label: string;
	onClick: () => void;
}

// Drops a single Line; a whole Item has its own "Remove item" text button.
// The enlarged hit area is what makes a 28px button tappable on a phone.
export const RemoveLineButton = ({ label, onClick }: RemoveLineButtonProps) => (
	<Button
		aria-label={label}
		className="relative size-7 shrink-0 before:absolute before:-inset-2 before:content-['']"
		icon={<HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />}
		onClick={onClick}
		size="icon-xs"
		type="button"
		variant="destructive"
	/>
);
