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
				"-mx-3 flex w-auto max-w-none px-3 pr-8 sm:-mx-4 sm:px-4 sm:pr-8 lg:-mx-6 lg:px-6 lg:pr-8",
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
