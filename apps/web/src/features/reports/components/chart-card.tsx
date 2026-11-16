import type { ComponentProps } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportChart } from "@/features/reports/components/report-chart";

interface ChartCardProps extends ComponentProps<typeof ReportChart> {
	title: string;
}

export const ChartCard = ({ title, ...chart }: ChartCardProps) => (
	<Card className="border-border/70">
		<CardHeader>
			<CardTitle>{title}</CardTitle>
		</CardHeader>
		<CardContent className="p-4 pt-0">
			<ReportChart {...chart} />
		</CardContent>
	</Card>
);
