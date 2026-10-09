import type { ReactNode } from "react";

interface ListPanelProps {
	children: ReactNode;
}

// No box around the list. On a tall desktop window the table fills the height
// under the filters; on a short one the page scrolls, so no row is out of reach.
export const ListPanel = ({ children }: ListPanelProps) => (
	<section data-list-panel className="group/list flex min-h-0 flex-col gap-3">
		{children}
	</section>
);
