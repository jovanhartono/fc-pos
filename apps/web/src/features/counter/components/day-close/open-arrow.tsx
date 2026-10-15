import { cn } from "@/lib/utils";

interface OpenArrowProps {
	className?: string;
}

// Marks a row that opens a list; a phone shows no hover to give it away.
export const OpenArrow = ({ className }: OpenArrowProps) => (
	<span
		aria-hidden="true"
		className={cn(
			"ml-2 inline-block w-2 text-muted-foreground font-normal",
			className,
		)}
	>
		›
	</span>
);
