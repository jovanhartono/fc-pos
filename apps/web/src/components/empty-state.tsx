import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
	children: ReactNode;
	icon?: IconSvgElement;
	action?: ReactNode;
	className?: string;
}

export const EmptyState = ({
	children,
	icon,
	action,
	className,
}: EmptyStateProps) => (
	<div
		className={cn(
			"flex flex-col items-center justify-center gap-3 py-10 text-center text-headline text-muted-foreground",
			className,
		)}
	>
		{icon ? (
			<HugeiconsIcon aria-hidden className="size-10" icon={icon} />
		) : null}
		<div>{children}</div>
		{action}
	</div>
);
