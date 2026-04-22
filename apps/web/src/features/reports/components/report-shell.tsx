import type { ReactNode } from "react";
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
		<div className="grid gap-6">
			<nav aria-label="Reports" className="border-border border-b">
				<div role="tablist" className="-mb-px flex flex-wrap">
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
									"relative px-4 py-3 text-sm transition-colors",
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
