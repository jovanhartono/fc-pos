import { XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface RemoveLineButtonProps {
	label: string;
	onClick: () => void;
}

// The one destructive icon button every cart surface uses to drop a line, an
// item or a product. The enlarged hit area (before:-inset-2) is what makes a
// 28px control tappable on a phone.
export const RemoveLineButton = ({ label, onClick }: RemoveLineButtonProps) => (
	<Button
		aria-label={label}
		className="relative size-7 shrink-0 border-destructive/50 bg-destructive/10 text-destructive before:absolute before:-inset-2 before:content-[''] hover:border-destructive hover:bg-destructive/20 hover:text-destructive"
		icon={<XIcon className="size-3.5" />}
		onClick={onClick}
		size="icon-xs"
		type="button"
		variant="outline"
	/>
);
