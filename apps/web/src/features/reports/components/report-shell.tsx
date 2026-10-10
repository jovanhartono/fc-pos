import type { ReactNode } from "react";
import { STRIP_FADE, TAB_STRIP_ROW } from "@/components/chip-strip";
import { cn } from "@/lib/utils";

export interface ReportTab {
	id: string;
	label: string;
}

interface ReportShellProps {
	tabs: ReportTab[];
	activeTab: string;
	onTabChange: (tab: string) => void;
	children: ReactNode;
}

export const ReportShell = ({
	tabs,
	activeTab,
	onTabChange,
	children,
}: ReportShellProps) => {
	const panelId = `reports-panel-${activeTab}`;

	return (
		<div className="grid grid-cols-1 gap-6">
			{/* One swipeable row: nine tabs wrapped onto three lines on a phone. */}
			<nav aria-label="Reports" className={STRIP_FADE}>
				<div role="tablist" className={TAB_STRIP_ROW}>
					{tabs.map((tab) => {
						const isActive = activeTab === tab.id;
						return (
							<button
								type="button"
								key={tab.id}
								id={`reports-tab-${tab.id}`}
								role="tab"
								aria-selected={isActive}
								aria-controls={`reports-panel-${tab.id}`}
								tabIndex={isActive ? 0 : -1}
								onClick={() => onTabChange(tab.id)}
								className={cn(
									"relative shrink-0 whitespace-nowrap px-4 py-3 text-sm transition-colors",
									"border-b-2",
									isActive
										? "border-foreground font-semibold text-foreground"
										: "border-transparent font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground",
								)}
							>
								{tab.label}
							</button>
						);
					})}
				</div>
			</nav>

			<div
				id={panelId}
				role="tabpanel"
				aria-labelledby={`reports-tab-${activeTab}`}
			>
				{children}
			</div>
		</div>
	);
};
