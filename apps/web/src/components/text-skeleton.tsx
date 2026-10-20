import { cn } from "@/lib/utils";

interface TextSkeletonProps {
	className?: string;
}

// A grey bar exactly one line of the surrounding text tall, for a value still
// loading inside a real card, so the card is already its final height.
export const TextSkeleton = ({ className }: TextSkeletonProps) => (
	<span
		aria-hidden
		className={cn(
			"inline-block w-20 animate-pulse select-none rounded-sm bg-foreground/[0.06] text-transparent motion-reduce:animate-none",
			className,
		)}
	>
		0
	</span>
);
