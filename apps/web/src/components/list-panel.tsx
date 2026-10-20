import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ListPanelProps {
	children: ReactNode;
	className?: string;
}

// No box around the list. On a tall desktop window the table fills the height
// under the filters, its pager pinned at the foot however many rows a filter
// returns; on a short one the page scrolls, so no row is out of reach. On a
// phone the panel reaches the screen's foot, so the pager rests there too.
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
