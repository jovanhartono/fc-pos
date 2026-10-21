import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
	children: ReactNode;
	icon?: Icon;
	action?: ReactNode;
	className?: string;
}

export const EmptyState = ({
	children,
	icon: IconComponent,
	action,
	className,
}: EmptyStateProps) => (
	<div
		className={cn(
			"flex flex-col items-center justify-center gap-3 py-10 text-center text-headline text-muted-foreground",
			className,
		)}
	>
		{IconComponent ? <IconComponent aria-hidden className="size-10" /> : null}
		<div>{children}</div>
		{action}
	</div>
);
