import { TextSkeleton } from "@/components/text-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiRow } from "@/features/reports/components/kpi-card";

// Built like the KPI cards it stands in for (label, number, comparison, note),
// so the cards keep their height when the numbers land.
export const ReportSkeleton = () => (
	<div aria-hidden className="grid gap-6">
		<KpiRow>
			{Array.from({ length: 4 }, (_, index) => (
				<Card className="border-border/70 py-0" key={index}>
					<CardContent className="grid min-w-0 gap-1 p-3 sm:p-4">
						<p className="text-subhead">
							<TextSkeleton className="w-24" />
						</p>
						<div className="flex min-h-7 items-end sm:min-h-8">
							<p className="text-title-3 sm:text-title-1">
								<TextSkeleton />
							</p>
						</div>
						<p className="text-subhead">
							<TextSkeleton className="w-28" />
						</p>
						<p className="text-footnote">
							<TextSkeleton className="w-20" />
						</p>
					</CardContent>
				</Card>
			))}
		</KpiRow>
		<Skeleton className="h-80 rounded-lg" />
	</div>
);
