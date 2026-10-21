import type { ReactNode } from "react";
import { STRIP_FADE } from "@/components/chip-strip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
}: ReportShellProps) => (
	<Tabs
		className="grid grid-cols-1 gap-6"
		onValueChange={(value) => onTabChange(String(value))}
		value={activeTab}
	>
		{/* Runs edge to edge on a phone, so a pill cut by the screen reads as
		    "scroll for more" rather than as a broken control. */}
		<TabsList
			aria-label="Reports"
			variant="pill"
			className={cn(
				// pl again: the pill list's own p-0 outranks the bleed's padding.
				"page-bleed flex w-auto max-w-none pr-8 pl-(--page-x)",
				STRIP_FADE,
			)}
		>
			{tabs.map((tab) => (
				<TabsTrigger key={tab.id} value={tab.id}>
					{tab.label}
				</TabsTrigger>
			))}
		</TabsList>
		<TabsContent value={activeTab}>{children}</TabsContent>
	</Tabs>
);
