import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
	icon: IconSvgElement;
	children: ReactNode;
	action?: ReactNode;
	isInset?: boolean;
	className?: string;
}

// The one empty look for the app. Inside a sheet or a Card it drops its own
// card by itself; isInset is for other bordered boxes, like a table.
export const EmptyState = ({
	icon,
	children,
	action,
	isInset = false,
	className,
}: EmptyStateProps) => (
	<div
		className={cn(
			"flex min-h-32 flex-col items-center justify-center gap-2.5 px-3 py-5 text-center text-body text-muted-foreground",
			!isInset &&
				"rounded-lg border bg-card in-data-[slot=card-content]:border-0 in-data-[slot=sheet-content]:border-0 in-data-[slot=card-content]:bg-transparent in-data-[slot=sheet-content]:bg-transparent in-data-[slot=card-content]:shadow-none in-data-[slot=sheet-content]:shadow-none",
			className,
		)}
	>
		<span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary">
			<HugeiconsIcon className="size-5" icon={icon} />
		</span>
		<div>{children}</div>
		{action}
	</div>
);
