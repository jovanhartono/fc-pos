import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
	children: ReactNode;
	action?: ReactNode;
	className?: string;
}

export const EmptyState = ({
	children,
	action,
	className,
}: EmptyStateProps) => (
	<div
		className={cn(
			"flex flex-col items-center justify-center gap-3 py-10 text-center text-headline text-muted-foreground",
			className,
		)}
	>
		<div>{children}</div>
		{action}
	</div>
);
