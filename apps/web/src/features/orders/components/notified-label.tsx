import { cn } from "@/shared/utils";

interface NotifiedLabelProps {
	className?: string;
}

export const NotifiedLabel = ({ className }: NotifiedLabelProps) => (
	<span
		className={cn(
			"whitespace-nowrap text-tone-good-foreground text-footnote",
			className,
		)}
	>
		NOTIFIED
	</span>
);
