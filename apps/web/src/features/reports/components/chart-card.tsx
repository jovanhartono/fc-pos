import type { ComponentProps } from "react";
import { SectionTitle } from "@/components/section";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ReportChart } from "@/features/reports/components/report-chart";

interface ChartCardProps extends ComponentProps<typeof ReportChart> {
	title: string;
}

export const ChartCard = ({ title, ...chart }: ChartCardProps) => (
	<Card className="border-border/70">
		<CardHeader>
			<SectionTitle title={title} />
		</CardHeader>
		<CardContent className="p-4 pt-0">
			<ReportChart {...chart} />
		</CardContent>
	</Card>
);
