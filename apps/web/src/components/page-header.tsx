import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
	title: string;
	// How many records the list below holds, read after the title like "Inbox 41".
	count?: number;
	description?: string;
	actions?: ReactNode;
	className?: string;
}

export function PageHeader({
	title,
	count,
	description,
	actions,
	className,
}: PageHeaderProps) {
	return (
		// On a phone the actions share the title's row and the description takes
		// the full width under both, instead of wrapping into a narrow column.
		<div
			className={cn(
				"mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1",
				className,
			)}
		>
			<h1 className="col-start-1 row-start-1 text-title-1 font-bold tracking-tight">
				{title}
				{count === undefined ? null : (
					<span className="ml-2.5 font-normal text-muted-foreground text-title-3 leading-none tabular-nums">
						{count}
					</span>
				)}
			</h1>
			{description ? (
				<p className="col-span-2 row-start-2 text-body text-muted-foreground sm:col-span-1">
					{description}
				</p>
			) : null}
			{actions ? (
				<div
					className={cn(
						"col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-2",
						description && "sm:row-span-2",
					)}
				>
					{actions}
				</div>
			) : null}
		</div>
	);
}
