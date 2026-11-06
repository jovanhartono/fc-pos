import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ListPanelProps {
	children: ReactNode;
	className?: string;
}

// On a tall desktop window the table fills the height and its pager stays at the
// foot; on a short one the page scrolls instead, so no row is out of reach.
export const ListPanel = ({ children, className }: ListPanelProps) => (
	<section
		data-list-panel
		className={cn(
			"flex flex-1 flex-col gap-3 lg:[@media(min-height:40rem)]:min-h-0",
			className,
		)}
	>
		{children}
	</section>
);
