import { Skeleton } from "@/components/ui/skeleton";

export const ReportSkeleton = () => (
	<div className="grid gap-6">
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
			{Array.from({ length: 4 }, (_, index) => (
				<Skeleton key={index} className="h-24 rounded-lg" />
			))}
		</div>
		<Skeleton className="h-80 rounded-lg" />
	</div>
);
