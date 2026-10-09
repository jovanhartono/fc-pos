import type { ReactNode } from "react";

interface ListPanelProps {
	children: ReactNode;
}

// No box around the list: filters sit on the page and the table carries the
// only border. On a desktop at least 640px tall the shell turns into a column
// for this panel, so the table takes exactly the height left under the
// filters; on a shorter window the page scrolls as before, so no row is ever
// squeezed out of reach.
export const ListPanel = ({ children }: ListPanelProps) => (
	<section data-list-panel className="flex min-h-0 flex-col gap-3">
		{children}
	</section>
);
