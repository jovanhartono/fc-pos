import { Skeleton } from "@/components/ui/skeleton";
import { CONTENT_FADE } from "@/lib/content-fade";

export const RoutePending = () => (
	<output aria-busy className={`grid gap-4 ${CONTENT_FADE}`}>
		<Skeleton className="h-8 w-48 motion-reduce:animate-none" />
		<Skeleton className="h-28 w-full motion-reduce:animate-none" />
		<Skeleton className="h-64 w-full motion-reduce:animate-none" />
	</output>
);
