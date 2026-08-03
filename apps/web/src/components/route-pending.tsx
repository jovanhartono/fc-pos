import { Skeleton } from "@/components/ui/skeleton";

export const RoutePending = () => (
	<output
		aria-busy
		className="grid animate-in gap-4 duration-500 fade-in motion-reduce:animate-none"
	>
		<Skeleton className="h-8 w-48 motion-reduce:animate-none" />
		<Skeleton className="h-28 w-full motion-reduce:animate-none" />
		<Skeleton className="h-64 w-full motion-reduce:animate-none" />
	</output>
);
